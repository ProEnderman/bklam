#!/usr/bin/env python3
"""Full real-data diagnostic evaluation — does NOT modify any code or models."""

from __future__ import annotations

import json
import logging
import sys
import time
import traceback
from collections import defaultdict

import numpy as np
import pandas as pd

logging.basicConfig(level=logging.WARNING, format="%(asctime)s [%(levelname)s] %(name)s — %(message)s")
logger = logging.getLogger("evaluation")

SEP = "=" * 72


def _json(obj):
    print(json.dumps(obj, indent=2, default=str))


def _safe(fn, label=""):
    try:
        return fn()
    except Exception as e:
        print(f"  !! {label} FAILED: {e}")
        traceback.print_exc()
        return None


def check_db():
    from repository import _engine
    from sqlalchemy import text
    try:
        with _engine().connect() as c:
            c.execute(text("SELECT 1"))
        return True
    except Exception as e:
        print(f"Database unreachable: {e}")
        return False


# ──────────────────────────────────────────────────────
#  Section 1: Revenue direct model evaluation (all families incl. two-stage)
# ──────────────────────────────────────────────────────

def section_1_revenue_direct():
    print(f"\n{SEP}")
    print("  SECTION 1: REVENUE — DIRECT MODEL EVALUATION (incl. two-stage)")
    print(SEP)

    from repository import load_metric, load_base_series
    from selector import select_model, get_last_selection_report
    from holidays import HolidayProvider, SpecialEventProvider
    from diagnostics import get_explosion_log, reset_explosion_log

    reset_explosion_log()

    ts = load_metric("revenue")
    print(f"  Data points: {len(ts)}")
    print(f"  Date range: {ts.dates[0].date()} → {ts.dates[-1].date()}")
    print(f"  Mean: {np.mean(ts.values):.2f}  Std: {np.std(ts.values):.2f}")

    base_series = load_base_series()
    hp = HolidayProvider()
    ep = SpecialEventProvider()

    import config as cfg
    orig_timeout = cfg.SELECTOR_TIMEOUT_SECONDS
    cfg.SELECTOR_TIMEOUT_SECONDS = 600

    t0 = time.time()
    candidate = select_model(
        ts, "revenue",
        max_candidates_sarima=30,
        max_candidates_prophet=6,
        max_candidates_exog=20,
        base_series=base_series,
        holiday_provider=hp,
        event_provider=ep,
    )
    elapsed = time.time() - t0
    cfg.SELECTOR_TIMEOUT_SECONDS = orig_timeout

    report = get_last_selection_report()
    expl_log = get_explosion_log()

    expl_triggered = sum(1 for e in expl_log if e.get("explosion_guard_triggered"))
    expl_total = len(expl_log)

    result = {
        "final_selected_model": candidate.model_name,
        "final_selected_family": candidate.model_family,
        "transform_used": candidate.transform_name,
        "composed": candidate.composed,
        "mean_mape": round(candidate.mean_mape, 6) if candidate.mean_mape < float("inf") else None,
        "mean_smape": round(candidate.mean_smape, 6) if candidate.mean_smape and candidate.mean_smape < float("inf") else None,
        "mean_mae": round(candidate.mean_mae, 4) if candidate.mean_mae and candidate.mean_mae < float("inf") else None,
        "fold_errors": [round(e, 6) for e in candidate.backtest_scores] if candidate.backtest_scores else [],
        "fold_error_mean": round(float(np.mean(candidate.backtest_scores)), 6) if candidate.backtest_scores else None,
        "fold_error_std": round(float(np.std(candidate.backtest_scores)), 6) if candidate.backtest_scores else None,
        "explosion_guard_total_checks": expl_total,
        "explosion_guard_triggered": expl_triggered,
        "explosion_guard_rejection_pct": round(expl_triggered / max(expl_total, 1) * 100, 1),
        "elapsed_seconds": round(elapsed, 1),
    }

    fam_eval = report.get("model_families_evaluated", {})
    result["candidates_per_family"] = {}
    result["best_per_family"] = {}
    for fam, stats in fam_eval.items():
        result["candidates_per_family"][fam] = {
            "evaluated": stats.get("evaluated", 0),
            "valid": stats.get("valid", 0),
            "rejected_explosion": stats.get("rejected_explosion_guard", 0),
            "rejected_convergence": stats.get("rejected_convergence", 0),
            "rejected_score_cap": stats.get("rejected_score_cap", 0),
            "skipped_reason": stats.get("skipped_reason"),
        }
    for fam, data in report.get("best_per_family", {}).items():
        result["best_per_family"][fam] = data

    if candidate.component_models:
        result["component_models"] = candidate.component_models

    print("\n  REVENUE EVALUATION RESULT:")
    _json(result)
    return result


# ──────────────────────────────────────────────────────
#  Section 2: Two-stage detail
# ──────────────────────────────────────────────────────

def section_2_two_stage_detail():
    print(f"\n{SEP}")
    print("  SECTION 2: TWO-STAGE REVENUE = BOOKINGS × AVG_CHECK — DETAIL")
    print(SEP)

    from repository import load_metric, load_base_series
    from avg_check import compute_avg_check_series
    from two_stage import backtest_two_stage_revenue
    from holidays import HolidayProvider, SpecialEventProvider

    rev = load_metric("revenue")
    bk = load_metric("bookings")
    ac = compute_avg_check_series(rev, bk)

    print(f"  Revenue data: {len(rev)} days")
    print(f"  Bookings data: {len(bk)} days")
    print(f"  Avg_check data: {len(ac)} days")
    print(f"  Avg_check mean: {np.mean(ac.values):.2f}, std: {np.std(ac.values):.2f}")

    base_series = load_base_series()
    hp = HolidayProvider()
    ep = SpecialEventProvider()

    bt = backtest_two_stage_revenue(
        rev, bk, ac,
        horizon=14, step=7,
        base_series=base_series,
        holiday_provider=hp,
        event_provider=ep,
        timeout_seconds=180,
    )

    result = {
        "valid": bt.get("valid"),
        "mean_smape": round(bt["mean_smape"], 6) if bt.get("mean_smape") else None,
        "mean_mape": round(bt["mean_mape"], 6) if bt.get("mean_mape") else None,
        "n_folds": bt.get("n_folds"),
        "n_failed": bt.get("n_failed"),
        "fail_rate": bt.get("fail_rate"),
        "component_families": bt.get("component_families"),
        "elapsed_seconds": bt.get("elapsed_seconds"),
    }

    print("\n  TWO-STAGE BACKTEST RESULT:")
    _json(result)
    return result


# ──────────────────────────────────────────────────────
#  Section 3: Leaderboard (now with two-stage)
# ──────────────────────────────────────────────────────

def section_3_leaderboard():
    print(f"\n{SEP}")
    print("  SECTION 3: REVENUE — MODEL LEADERBOARD (incl. two-stage)")
    print(SEP)

    from registry import get_leaderboard
    lb = get_leaderboard("revenue", top_k=6)

    entries = []
    for e in lb:
        entries.append({
            "model_family": e.model_family,
            "params": e.params,
            "transform": e.transform_name,
            "mean_error": round(e.mean_error, 6),
        })

    print("\n  LEADERBOARD TOP 6:")
    _json(entries)
    return entries


# ──────────────────────────────────────────────────────
#  Section 4: Avg check analysis
# ──────────────────────────────────────────────────────

def section_4_avg_check():
    print(f"\n{SEP}")
    print("  SECTION 4: AVG CHECK SERIES ANALYSIS")
    print(SEP)

    from repository import load_metric
    from avg_check import compute_avg_check_series

    rev = load_metric("revenue")
    bk = load_metric("bookings")
    ac = compute_avg_check_series(rev, bk)

    vals = ac.values
    result = {
        "n_days": len(vals),
        "mean": round(float(np.mean(vals)), 2),
        "std": round(float(np.std(vals)), 2),
        "min": round(float(np.min(vals)), 2),
        "max": round(float(np.max(vals)), 2),
        "p10": round(float(np.percentile(vals, 10)), 2),
        "p50": round(float(np.percentile(vals, 50)), 2),
        "p90": round(float(np.percentile(vals, 90)), 2),
        "cv": round(float(np.std(vals) / max(np.mean(vals), 1)), 4),
        "has_nan": bool(np.any(~np.isfinite(vals))),
        "has_zero": bool(np.any(vals <= 0)),
    }

    # Weekly avg check pattern
    ac_df = pd.DataFrame({"ds": ac.dates, "val": ac.values})
    ac_df["dow"] = ac_df["ds"].dt.day_name()
    dow_means = {}
    for dow in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]:
        subset = ac_df[ac_df["dow"] == dow]["val"]
        if len(subset) > 0:
            dow_means[dow] = round(float(subset.mean()), 2)
    result["weekday_means"] = dow_means

    print("\n  AVG CHECK ANALYSIS:")
    _json(result)
    return result


# ──────────────────────────────────────────────────────
#  Section 5: Comparison summary
# ──────────────────────────────────────────────────────

def section_5_comparison(rev_result, two_stage_result):
    print(f"\n{SEP}")
    print("  SECTION 5: TWO-STAGE vs DIRECT — COMPARISON")
    print(SEP)

    direct_smape = None
    direct_family = None
    if rev_result:
        direct_smape = rev_result.get("mean_smape")
        direct_family = rev_result.get("final_selected_family")

    ts_smape = None
    if two_stage_result:
        ts_smape = two_stage_result.get("mean_smape")

    improvement = None
    if direct_smape and ts_smape:
        improvement = round((direct_smape - ts_smape) / max(direct_smape, 1e-9) * 100, 2)

    winner = "unknown"
    if direct_smape is not None and ts_smape is not None:
        if ts_smape < direct_smape - 0.005:
            winner = "two_stage"
        else:
            winner = f"direct ({direct_family})"
    elif direct_smape is not None:
        winner = f"direct ({direct_family})"

    summary = {
        "direct_best_family": direct_family,
        "direct_smape": round(direct_smape, 6) if direct_smape else None,
        "two_stage_smape": round(ts_smape, 6) if ts_smape else None,
        "improvement_pct": improvement,
        "winner": winner,
        "previous_baseline": "20.4% sMAPE",
    }

    print("\n  COMPARISON:")
    _json(summary)

    return summary


# ──────────────────────────────────────────────────────
#  Section 6: Bookings quick check
# ──────────────────────────────────────────────────────

def section_6_bookings():
    print(f"\n{SEP}")
    print("  SECTION 6: BOOKINGS — QUICK CHECK")
    print(SEP)

    from repository import load_metric, load_base_series
    from selector import select_model, get_last_selection_report
    from holidays import HolidayProvider, SpecialEventProvider
    from diagnostics import reset_explosion_log

    reset_explosion_log()

    ts = load_metric("bookings")
    print(f"  Data points: {len(ts)}")

    base_series = load_base_series()
    hp = HolidayProvider()
    ep = SpecialEventProvider()

    import config as cfg
    orig_timeout = cfg.SELECTOR_TIMEOUT_SECONDS
    cfg.SELECTOR_TIMEOUT_SECONDS = 300

    candidate = select_model(
        ts, "bookings",
        max_candidates_sarima=15,
        max_candidates_prophet=3,
        max_candidates_exog=10,
        base_series=base_series,
        holiday_provider=hp,
        event_provider=ep,
    )
    cfg.SELECTOR_TIMEOUT_SECONDS = orig_timeout

    report = get_last_selection_report()
    bl_score = report.get("baseline_score")
    improvement = None
    if bl_score and bl_score < float("inf") and candidate.mean_mape < float("inf"):
        improvement = round((bl_score - candidate.mean_mape) / max(bl_score, 1e-9) * 100, 2)

    result = {
        "selected_model_family": candidate.model_family,
        "mean_mape": round(candidate.mean_mape, 6) if candidate.mean_mape < float("inf") else None,
        "baseline_mape": round(bl_score, 6) if bl_score and bl_score < float("inf") else None,
        "improvement_vs_baseline_pct": improvement,
    }

    print("\n  BOOKINGS:")
    _json(result)
    return result


# ──────────────────────────────────────────────────────
#  Section 7: Final summary
# ──────────────────────────────────────────────────────

def section_7_summary(rev_result, two_stage_result, comparison, bookings_result):
    print(f"\n{SEP}")
    print("  SECTION 7: FINAL SUMMARY")
    print(SEP)

    rev_smape = rev_result.get("mean_smape") if rev_result else None
    ts_smape = two_stage_result.get("mean_smape") if two_stage_result else None
    best_smape = None
    if rev_smape and ts_smape:
        best_smape = min(rev_smape, ts_smape)
    elif rev_smape:
        best_smape = rev_smape
    elif ts_smape:
        best_smape = ts_smape

    prev_smape = 0.204

    summary = {
        "best_revenue_smape_now": f"{best_smape * 100:.1f}%" if best_smape else "N/A",
        "direct_revenue_smape": f"{rev_smape * 100:.1f}%" if rev_smape else "N/A",
        "two_stage_revenue_smape": f"{ts_smape * 100:.1f}%" if ts_smape else "N/A",
        "revenue_smape_previous": f"{prev_smape * 100:.1f}%",
        "accuracy_improved": best_smape < prev_smape if best_smape else None,
        "winner": comparison.get("winner") if comparison else "N/A",
        "two_stage_viable": ts_smape is not None and ts_smape < 0.30 if ts_smape else False,
        "bookings_family": bookings_result.get("selected_model_family") if bookings_result else "N/A",
        "bookings_improvement_pct": bookings_result.get("improvement_vs_baseline_pct") if bookings_result else None,
    }

    print("\n  FINAL SUMMARY:")
    _json(summary)

    print("\n  NARRATIVE:")
    if best_smape and best_smape < prev_smape:
        print(f"  ✓ Revenue accuracy IMPROVED: {prev_smape*100:.1f}% → {best_smape*100:.1f}% sMAPE")
    elif best_smape:
        print(f"  ✗ Revenue accuracy did NOT improve: {prev_smape*100:.1f}% → {best_smape*100:.1f}% sMAPE")
    else:
        print(f"  ? Revenue accuracy could not be compared")

    print(f"  • Winner: {summary['winner']}")
    if ts_smape:
        print(f"  • Two-stage sMAPE: {ts_smape*100:.1f}% — {'viable' if summary['two_stage_viable'] else 'not competitive'}")
    print(f"  • Direct best sMAPE: {rev_smape*100:.1f}%" if rev_smape else "  • Direct: N/A")

    return summary


# ──────────────────────────────────────────────────────
#  Main
# ──────────────────────────────────────────────────────

def main():
    print(f"\n{'#' * 72}")
    print("  FULL EVALUATION — TWO-STAGE REVENUE MODEL")
    print(f"{'#' * 72}")

    if not check_db():
        print("\n  Cannot proceed without database. Exiting.")
        sys.exit(1)
    print("  Database: OK")

    rev = _safe(section_1_revenue_direct, "Section 1")
    ts = _safe(section_2_two_stage_detail, "Section 2")
    _safe(section_3_leaderboard, "Section 3")
    _safe(section_4_avg_check, "Section 4")
    comp = _safe(lambda: section_5_comparison(rev, ts), "Section 5")
    bk = _safe(section_6_bookings, "Section 6")
    _safe(lambda: section_7_summary(rev, ts, comp, bk), "Section 7")

    print(f"\n{'#' * 72}")
    print("  EVALUATION COMPLETE")
    print(f"{'#' * 72}\n")


if __name__ == "__main__":
    main()
