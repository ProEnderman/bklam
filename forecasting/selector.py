"""Multi-family model selection: baselines, SARIMA, Prophet, SARIMAX-exog."""

from __future__ import annotations

import logging
import time
from typing import Any, Optional, Tuple

import numpy as np
import pandas as pd

from types_ import TimeSeries, ModelCandidate, BacktestDebugReport, RegistryRun
from transforms import Transform, get_transform
from baselines import forecast_ma7, forecast_same_day_last_week
from sarima import SEARCH_SPACE, fit_forecast_sarima
from sarimax_exog import EXOG_SEARCH_SPACE, fit_forecast_sarimax_exog
from prophet_model import fit_forecast_prophet
from backtest import evaluate_candidate, compute_folds
from metrics import mape as mape_fn, smape as smape_fn, mae as mae_fn, score_by_name
from holidays import HolidayProvider, SpecialEventProvider, build_holiday_flags, merge_prophet_holidays
from regressors import available_regressors, build_train_exog, build_future_exog
from registry import record_run
from config import (
    BACKTEST_HORIZON_DAYS,
    BACKTEST_STEP_DAYS,
    SARIMA_BEAT_BASELINE_MARGIN,
    MAPE_CAP_FOR_SELECTOR,
    MIN_HISTORY_DAYS,
    METRIC_OPTIMIZATION,
    DEBUG_BACKTEST,
    MAX_CANDIDATES_SARIMA,
    MAX_CANDIDATES_SARIMAX_EXOG,
    MAX_CANDIDATES_PROPHET,
    SELECTOR_TIMEOUT_SECONDS,
    PROPHET_CHANGEPOINT_PRIOR_SCALE,
    PROPHET_SEASONALITY_MODE,
    MODEL_FAMILY_BASELINE,
    MODEL_FAMILY_SARIMA,
    MODEL_FAMILY_PROPHET,
    MODEL_FAMILY_SARIMAX_EXOG,
    MODEL_FAMILY_TWO_STAGE,
    MODEL_FAMILY_ENSEMBLE,
    TWO_STAGE_ENABLED_DEFAULT,
    TWO_STAGE_MIN_HISTORY_DAYS,
    TWO_STAGE_BEAT_DIRECT_MARGIN,
    TWO_STAGE_TIMEOUT_SECONDS,
    ENSEMBLE_ENABLED_DEFAULT,
    ENSEMBLE_CANDIDATES,
    ENSEMBLE_BEAT_BEST_SINGLE_MARGIN,
    ENSEMBLE_TIMEOUT_SEC,
    ENSEMBLE_WEIGHT_MODE,
    VALIDATION_MODE,
)

logger = logging.getLogger(__name__)

_last_selection_report: dict[str, Any] = {}


def get_last_selection_report() -> dict[str, Any]:
    return dict(_last_selection_report)


def _baseline_backtest_scores(
    ts: TimeSeries, forecast_fn, metric_name: str, horizon: int, step: int,
) -> Tuple[float, float, float]:
    n = len(ts)
    folds = compute_folds(n, horizon, step)
    if not folds:
        return float("inf"), float("inf"), float("inf")

    opt_metric = METRIC_OPTIMIZATION.get(metric_name, "mape")
    primary_scores, mape_scores, smape_scores = [], [], []

    for train_end, test_end in folds:
        train_ts = ts.slice(0, train_end)
        test_vals = ts.values[train_end:test_end]
        h = len(test_vals)
        try:
            result = forecast_fn(train_ts, h)
            yhat = np.array(result.yhat[:h])
            primary_scores.append(min(score_by_name(opt_metric, test_vals, yhat), MAPE_CAP_FOR_SELECTOR))
            mape_scores.append(mape_fn(test_vals, yhat))
            smape_scores.append(smape_fn(test_vals, yhat))
        except Exception:
            primary_scores.append(MAPE_CAP_FOR_SELECTOR)
            mape_scores.append(MAPE_CAP_FOR_SELECTOR)
            smape_scores.append(MAPE_CAP_FOR_SELECTOR)

    return float(np.mean(primary_scores)), float(np.mean(mape_scores)), float(np.mean(smape_scores))


class _FamilyStats:
    """Tracks evaluation and rejection counts for a model family."""

    def __init__(self, name: str):
        self.name = name
        self.evaluated = 0
        self.valid = 0
        self.rejected_explosion = 0
        self.rejected_convergence = 0
        self.rejected_score_cap = 0
        self.rejected_fit_failed = 0
        self.best_error: float = float("inf")
        self.best_params: dict = {}
        self.skipped_reason: Optional[str] = None

    def record(self, cand: ModelCandidate):
        self.evaluated += 1
        if cand.is_valid:
            self.valid += 1
            if cand.mean_mape < self.best_error:
                self.best_error = cand.mean_mape
                self.best_params = cand.params
        else:
            for w in cand.warnings:
                if "explosion" in w:
                    self.rejected_explosion += 1
                elif "convergence" in w or "fit_failed" in w:
                    self.rejected_convergence += 1
                elif "score_exceeds_cap" in w:
                    self.rejected_score_cap += 1
                else:
                    self.rejected_fit_failed += 1

    def to_dict(self) -> dict:
        d: dict[str, Any] = {
            "evaluated": self.evaluated,
            "valid": self.valid,
            "rejected_explosion_guard": self.rejected_explosion,
            "rejected_convergence": self.rejected_convergence,
            "rejected_score_cap": self.rejected_score_cap,
            "rejected_fit_failed": self.rejected_fit_failed,
            "best_error": round(self.best_error, 6) if self.best_error < float("inf") else None,
            "best_params": self.best_params,
        }
        if self.skipped_reason:
            d["skipped_reason"] = self.skipped_reason
        pct = (self.rejected_explosion / self.evaluated * 100) if self.evaluated > 0 else 0
        d["explosion_rejection_pct"] = round(pct, 1)
        if pct > 70 and self.evaluated >= 3:
            d["WARNING"] = "explosion_guard_may_be_over_restrictive"
        return d


def select_model(
    ts: TimeSeries,
    metric: str,
    horizon: int = BACKTEST_HORIZON_DAYS,
    step: int = BACKTEST_STEP_DAYS,
    max_candidates_sarima: int = MAX_CANDIDATES_SARIMA,
    max_candidates_prophet: int = MAX_CANDIDATES_PROPHET,
    max_candidates_exog: int = MAX_CANDIDATES_SARIMAX_EXOG,
    base_series: Optional[dict[str, TimeSeries]] = None,
    holiday_provider: Optional[HolidayProvider] = None,
    event_provider: Optional[SpecialEventProvider] = None,
) -> ModelCandidate:
    global _last_selection_report

    transform = get_transform(metric)
    opt_metric = METRIC_OPTIMIZATION.get(metric, "mape")
    start_time = time.time()

    family_stats: dict[str, _FamilyStats] = {
        MODEL_FAMILY_SARIMA: _FamilyStats(MODEL_FAMILY_SARIMA),
        MODEL_FAMILY_PROPHET: _FamilyStats(MODEL_FAMILY_PROPHET),
        MODEL_FAMILY_SARIMAX_EXOG: _FamilyStats(MODEL_FAMILY_SARIMAX_EXOG),
    }

    if len(ts) < MIN_HISTORY_DAYS:
        logger.warning("%s: only %d days, using MA7 baseline", metric, len(ts))
        _last_selection_report = _build_report(
            metric, family_stats, None, None, 0, "ma7",
            MODEL_FAMILY_BASELINE, "insufficient_data",
        )
        return _make_baseline_candidate("ma7", float("inf"), warnings=["insufficient_data_for_sarima"])

    # ── Baselines ──
    ma7_p, ma7_m, ma7_s = _baseline_backtest_scores(ts, forecast_ma7, metric, horizon, step)
    sdlw_p, sdlw_m, sdlw_s = _baseline_backtest_scores(ts, forecast_same_day_last_week, metric, horizon, step)

    best_bl_score = min(ma7_p, sdlw_p)
    best_bl_name = "ma7" if ma7_p <= sdlw_p else "same_day_last_week"
    best_bl_smape = ma7_s if best_bl_name == "ma7" else sdlw_s

    logger.info(
        "%s baselines [opt=%s] — MA7=%.4f SDLW=%.4f best=%s(%.4f)",
        metric, opt_metric, ma7_p, sdlw_p, best_bl_name, best_bl_score,
    )

    all_candidates: list[Tuple[ModelCandidate, Optional[BacktestDebugReport]]] = []

    import config as _cfg
    def _timed_out():
        return (time.time() - start_time) > _cfg.SELECTOR_TIMEOUT_SECONDS

    # ── SARIMA search ──
    best_sarima = _search_sarima(ts, transform, metric, horizon, step,
                                 max_candidates_sarima, _timed_out, family_stats[MODEL_FAMILY_SARIMA])
    if best_sarima:
        all_candidates.append((best_sarima, None))

    # ── Prophet search ──
    if not _timed_out():
        best_prophet = _search_prophet(
            ts, transform, metric, horizon, step, max_candidates_prophet,
            base_series, holiday_provider, event_provider, _timed_out,
            family_stats[MODEL_FAMILY_PROPHET],
        )
        if best_prophet:
            all_candidates.append((best_prophet, None))
    else:
        family_stats[MODEL_FAMILY_PROPHET].skipped_reason = "timeout"

    # ── SARIMAX-exog search ──
    if not _timed_out() and base_series:
        best_exog = _search_sarimax_exog(
            ts, transform, metric, horizon, step, max_candidates_exog,
            base_series, holiday_provider, event_provider, _timed_out,
            family_stats[MODEL_FAMILY_SARIMAX_EXOG],
        )
        if best_exog:
            all_candidates.append((best_exog, None))
    elif not base_series:
        family_stats[MODEL_FAMILY_SARIMAX_EXOG].skipped_reason = "no_base_series"
    else:
        family_stats[MODEL_FAMILY_SARIMAX_EXOG].skipped_reason = "timeout"

    # ── Weighted ensemble for revenue only ──
    ensemble_cand = None
    if (metric == "revenue"
            and ENSEMBLE_ENABLED_DEFAULT
            and not _timed_out()):
        ensemble_cand = _evaluate_ensemble(
            ts, all_candidates, horizon, step,
            base_series, holiday_provider, event_provider,
            best_bl_score, best_bl_smape,
        )
        if ensemble_cand and ensemble_cand.is_valid:
            all_candidates.append((ensemble_cand, None))
            family_stats[MODEL_FAMILY_ENSEMBLE] = _FamilyStats(MODEL_FAMILY_ENSEMBLE)
            family_stats[MODEL_FAMILY_ENSEMBLE].record(ensemble_cand)
        elif ensemble_cand:
            family_stats[MODEL_FAMILY_ENSEMBLE] = _FamilyStats(MODEL_FAMILY_ENSEMBLE)
            family_stats[MODEL_FAMILY_ENSEMBLE].record(ensemble_cand)
            family_stats[MODEL_FAMILY_ENSEMBLE].skipped_reason = (
                ensemble_cand.warnings[0] if ensemble_cand.warnings else "invalid"
            )

    # ── Two-stage for revenue only ──
    two_stage_cand = None
    if (metric == "revenue"
            and TWO_STAGE_ENABLED_DEFAULT
            and len(ts) >= TWO_STAGE_MIN_HISTORY_DAYS
            and not _timed_out()):
        two_stage_cand = _evaluate_two_stage(
            ts, base_series, holiday_provider, event_provider,
            horizon, step, _timed_out,
        )
        if two_stage_cand and two_stage_cand.is_valid:
            all_candidates.append((two_stage_cand, None))
            family_stats[MODEL_FAMILY_TWO_STAGE] = _FamilyStats(MODEL_FAMILY_TWO_STAGE)
            family_stats[MODEL_FAMILY_TWO_STAGE].record(two_stage_cand)
        elif two_stage_cand:
            family_stats[MODEL_FAMILY_TWO_STAGE] = _FamilyStats(MODEL_FAMILY_TWO_STAGE)
            family_stats[MODEL_FAMILY_TWO_STAGE].record(two_stage_cand)
            family_stats[MODEL_FAMILY_TWO_STAGE].skipped_reason = (
                two_stage_cand.warnings[0] if two_stage_cand.warnings else "invalid"
            )

    # ── Record all to registry ──
    for cand, _ in all_candidates:
        _record(cand, metric)

    # ── Select best ──
    valid = [(c, d) for c, d in all_candidates if c.is_valid]
    if not valid:
        elapsed = time.time() - start_time
        logger.info("%s: no valid model candidates, using baseline %s", metric, best_bl_name)
        _last_selection_report = _build_report(
            metric, family_stats, best_bl_score, best_bl_smape, elapsed,
            best_bl_name, MODEL_FAMILY_BASELINE, "no_valid_candidates",
        )
        if VALIDATION_MODE:
            _log_validation_report(_last_selection_report)
        return _make_baseline_candidate(best_bl_name, best_bl_score)

    valid.sort(key=lambda x: x[0].mean_mape)
    best, best_debug = valid[0]

    # Ensemble must beat best single model by extra margin
    if best.model_family == MODEL_FAMILY_ENSEMBLE and len(valid) > 1:
        single_valid = [(c, d) for c, d in valid if c.model_family not in (MODEL_FAMILY_ENSEMBLE, MODEL_FAMILY_TWO_STAGE)]
        if single_valid:
            best_single = single_valid[0][0]
            ens_smape = best.mean_smape if best.mean_smape else best.mean_mape
            sgl_smape = best_single.mean_smape if best_single.mean_smape else best_single.mean_mape
            if ens_smape > sgl_smape - ENSEMBLE_BEAT_BEST_SINGLE_MARGIN:
                logger.info(
                    "%s: ensemble (%.4f) doesn't beat single %s (%.4f) by margin %.3f",
                    metric, ens_smape, best_single.model_family, sgl_smape,
                    ENSEMBLE_BEAT_BEST_SINGLE_MARGIN,
                )
                best, best_debug = single_valid[0]

    # Two-stage must beat best direct model by extra margin
    if best.model_family == MODEL_FAMILY_TWO_STAGE and len(valid) > 1:
        direct_valid = [(c, d) for c, d in valid if c.model_family != MODEL_FAMILY_TWO_STAGE]
        if direct_valid:
            best_direct = direct_valid[0][0]
            ts_smape = best.mean_smape if best.mean_smape else best.mean_mape
            dir_smape = best_direct.mean_smape if best_direct.mean_smape else best_direct.mean_mape
            if ts_smape > dir_smape - TWO_STAGE_BEAT_DIRECT_MARGIN:
                logger.info(
                    "%s: two_stage (%.4f) doesn't beat direct %s (%.4f) by margin %.3f, preferring direct",
                    metric, ts_smape, best_direct.model_family, dir_smape, TWO_STAGE_BEAT_DIRECT_MARGIN,
                )
                best, best_debug = direct_valid[0]

    margin_met = best.mean_mape < (best_bl_score - SARIMA_BEAT_BASELINE_MARGIN)
    if not margin_met and opt_metric == "smape" and best.mean_smape is not None:
        if best.mean_smape < best_bl_smape:
            margin_met = True

    elapsed = time.time() - start_time

    if not margin_met:
        logger.info(
            "%s: best candidate %s(%.4f) doesn't beat baseline %s(%.4f), using baseline",
            metric, best.model_name, best.mean_mape, best_bl_name, best_bl_score,
        )
        _last_selection_report = _build_report(
            metric, family_stats, best_bl_score, best_bl_smape, elapsed,
            best_bl_name, MODEL_FAMILY_BASELINE, "baseline_gate",
        )
        if VALIDATION_MODE:
            _log_validation_report(_last_selection_report)
        return _make_baseline_candidate(best_bl_name, best_bl_score,
            warnings=[f"best_{best.model_family}_{best.mean_mape:.4f}_vs_baseline_{best_bl_score:.4f}"])

    logger.info(
        "%s: selected %s [%s] score=%.4f (baseline=%.4f) in %.1fs",
        metric, best.model_name, best.model_family, best.mean_mape, best_bl_score,
        elapsed,
    )
    _last_selection_report = _build_report(
        metric, family_stats, best_bl_score, best_bl_smape, elapsed,
        best.model_name, best.model_family or best.model_name, "won_competition",
        selected_error=best.mean_mape,
        fold_errors=best.backtest_scores,
    )
    if VALIDATION_MODE:
        _log_validation_report(_last_selection_report)
    return best


def _build_report(
    metric: str,
    family_stats: dict[str, _FamilyStats],
    baseline_score: Optional[float],
    baseline_smape: Optional[float],
    elapsed: float,
    selected_name: str,
    selected_family: str,
    reason: str,
    selected_error: Optional[float] = None,
    fold_errors: Optional[list[float]] = None,
) -> dict[str, Any]:
    families_evaluated = {k: v.to_dict() for k, v in family_stats.items()}
    best_per_family = {}
    for k, v in family_stats.items():
        if v.best_error < float("inf"):
            best_per_family[k] = {"error": round(v.best_error, 6), "params": v.best_params}
    if baseline_score is not None and baseline_score < float("inf"):
        best_per_family[MODEL_FAMILY_BASELINE] = {"error": round(baseline_score, 6)}

    explosion_stats = {}
    for k, v in family_stats.items():
        explosion_stats[k] = {
            "rejected": v.rejected_explosion,
            "total": v.evaluated,
            "pct": round(v.rejected_explosion / max(v.evaluated, 1) * 100, 1),
        }

    report: dict[str, Any] = {
        "metric": metric,
        "model_families_evaluated": families_evaluated,
        "best_per_family": best_per_family,
        "final_selected_model": selected_name,
        "final_selected_family": selected_family,
        "selection_reason": reason,
        "baseline_score": round(baseline_score, 6) if baseline_score and baseline_score < float("inf") else None,
        "baseline_smape": round(baseline_smape, 6) if baseline_smape and baseline_smape < float("inf") else None,
        "elapsed_seconds": round(elapsed, 2),
        "explosion_guard_stats": explosion_stats,
    }
    if selected_error is not None:
        report["selected_error"] = round(selected_error, 6)
    if fold_errors:
        arr = [e for e in fold_errors if np.isfinite(e)]
        if arr:
            report["fold_error_distribution"] = {
                "mean": round(float(np.mean(arr)), 6),
                "std": round(float(np.std(arr)), 6),
                "min": round(float(np.min(arr)), 6),
                "max": round(float(np.max(arr)), 6),
                "n": len(arr),
            }
    return report


def _log_validation_report(report: dict) -> None:
    logger.info("═══ VALIDATION REPORT [%s] ═══", report.get("metric"))
    logger.info("  selected: %s [%s] reason=%s",
                report.get("final_selected_model"),
                report.get("final_selected_family"),
                report.get("selection_reason"))
    logger.info("  baseline: %.4f  elapsed: %.1fs",
                report.get("baseline_score") or 0,
                report.get("elapsed_seconds", 0))
    for fam, stats in report.get("model_families_evaluated", {}).items():
        logger.info("  %s: eval=%d valid=%d best=%s expl_rej=%d(%s%%) %s",
                    fam, stats["evaluated"], stats["valid"],
                    stats.get("best_error"),
                    stats["rejected_explosion_guard"],
                    stats["explosion_rejection_pct"],
                    stats.get("skipped_reason", ""),
                    )
        if "WARNING" in stats:
            logger.warning("  ⚠ %s: %s", fam, stats["WARNING"])


def _search_sarima(ts, transform, metric, horizon, step, max_cands, timed_out,
                   stats: _FamilyStats) -> Optional[ModelCandidate]:
    best = None
    evaluated = 0
    sorted_space = sorted(SEARCH_SPACE, key=lambda x: (x[1][1], sum(x[0]) + sum(x[1][:3])))

    for order, seasonal_order in sorted_space:
        if evaluated >= max_cands or timed_out():
            break
        params = {"order": list(order), "seasonal_order": list(seasonal_order)}

        def _fn(y_t, h, _o=order, _s=seasonal_order):
            return fit_forecast_sarima(y_t, _o, _s, h)

        cand, debug = evaluate_candidate(ts, transform, _fn, "sarima", params, metric, horizon, step)
        cand.model_family = MODEL_FAMILY_SARIMA
        evaluated += 1
        stats.record(cand)

        if cand.is_valid and (best is None or cand.mean_mape < best.mean_mape):
            best = cand
            if debug:
                best.mean_smape = debug.mean_smape
                best.mean_mae = debug.mean_mae
        if best and best.mean_mape < 0.08:
            break

    logger.info("%s SARIMA: evaluated %d, best=%.4f", metric, evaluated, best.mean_mape if best else float("inf"))
    return best


def _search_prophet(ts, transform, metric, horizon, step, max_cands,
                    base_series, hp, ep, timed_out,
                    stats: _FamilyStats) -> Optional[ModelCandidate]:
    try:
        import prophet  # noqa: F401
    except ImportError:
        stats.skipped_reason = "prophet_not_installed"
        logger.info("%s: prophet not installed, skipping", metric)
        return None

    holidays_df = None
    if hp:
        hdf = hp.holidays_df(ts.dates[0].date(), ts.dates[-1].date())
        edf = ep.events_df(ts.dates[0].date(), ts.dates[-1].date()) if ep else pd.DataFrame(columns=["ds", "event_name"])
        holidays_df = merge_prophet_holidays(hdf, edf)

    configs = [
        {"changepoint_prior_scale": 0.05, "seasonality_mode": "additive"},
        {"changepoint_prior_scale": 0.10, "seasonality_mode": "additive"},
        {"changepoint_prior_scale": 0.15, "seasonality_mode": "additive"},
        {"changepoint_prior_scale": 0.05, "seasonality_mode": "multiplicative"},
        {"changepoint_prior_scale": 0.10, "seasonality_mode": "multiplicative"},
        {"changepoint_prior_scale": 0.15, "seasonality_mode": "multiplicative"},
    ][:max_cands]

    best = None

    for cfg_i, cfg in enumerate(configs):
        if timed_out():
            break

        def _fit_fn(y_t, h, _cfg=cfg):
            train_end_idx = len(y_t)
            ts_fold = TimeSeries(ts.dates[:train_end_idx], transform.inverse(y_t), ts.name)
            yhat, lo, hi, diag = fit_forecast_prophet(ts_fold, transform, h, holidays_df=holidays_df, config=_cfg)
            if yhat is None:
                return None, None, None, diag
            return transform.forward(yhat), transform.forward(lo), transform.forward(hi), diag

        params = {"config_idx": cfg_i, **cfg}
        cand, debug = evaluate_candidate(ts, transform, _fit_fn, "prophet", params, metric, horizon, step)
        cand.model_family = MODEL_FAMILY_PROPHET
        stats.record(cand)

        if cand.is_valid and (best is None or cand.mean_mape < best.mean_mape):
            best = cand
            if debug:
                best.mean_smape = debug.mean_smape
                best.mean_mae = debug.mean_mae

    logger.info("%s Prophet: evaluated %d, best=%.4f",
                metric, min(len(configs), max_cands), best.mean_mape if best else float("inf"))
    return best


def _search_sarimax_exog(ts, transform, metric, horizon, step, max_cands,
                         base_series, hp, ep, timed_out,
                         stats: _FamilyStats) -> Optional[ModelCandidate]:
    from holidays import build_holiday_flags
    from regressors import build_train_exog, build_future_exog, available_regressors as avail_regs

    avail = avail_regs(base_series)
    regressor_names = [r for r in avail if r != metric]
    if not regressor_names:
        stats.skipped_reason = "no_regressors_available"
        logger.info("%s SARIMAX-exog: no regressors available, skipping", metric)
        return None

    hdf = hp.holidays_df(ts.dates[0].date(), ts.dates[-1].date()) if hp else pd.DataFrame(columns=["ds", "holiday"])
    edf = ep.events_df(ts.dates[0].date(), ts.dates[-1].date()) if ep else pd.DataFrame(columns=["ds", "event_name"])
    h_flags = build_holiday_flags(ts.dates, hdf, edf)

    full_exog = build_train_exog(metric, ts.dates, base_series, h_flags)
    if full_exog.empty:
        stats.skipped_reason = "empty_exog_matrix"
        return None

    if VALIDATION_MODE:
        nan_cols = [c for c in full_exog.columns if full_exog[c].isna().all()]
        logger.info("%s SARIMAX-exog: exog_train shape=%s, cols=%s, all-NaN cols=%s",
                    metric, full_exog.shape, list(full_exog.columns), nan_cols)

    best = None
    evaluated = 0
    sorted_space = sorted(EXOG_SEARCH_SPACE, key=lambda x: (x[1][1], sum(x[0]) + sum(x[1][:3])))

    for order, seasonal_order in sorted_space:
        if evaluated >= max_cands or timed_out():
            break
        params = {"order": list(order), "seasonal_order": list(seasonal_order), "exog_cols": list(full_exog.columns)}

        def _fn(y_t, h, _o=order, _s=seasonal_order):
            train_end_idx = len(y_t)
            exog_tr = full_exog.iloc[:train_end_idx].values
            exog_te = full_exog.iloc[train_end_idx:train_end_idx + h].values
            if len(exog_te) < h:
                pad = np.tile(exog_tr[-1:], (h - len(exog_te), 1))
                exog_te = np.vstack([exog_te, pad]) if len(exog_te) > 0 else pad
            return fit_forecast_sarimax_exog(y_t, _o, _s, exog_tr, exog_te, h)

        cand, debug = evaluate_candidate(ts, transform, _fn, "sarimax_exog", params, metric, horizon, step)
        cand.model_family = MODEL_FAMILY_SARIMAX_EXOG
        evaluated += 1
        stats.record(cand)

        if cand.is_valid and (best is None or cand.mean_mape < best.mean_mape):
            best = cand
            if debug:
                best.mean_smape = debug.mean_smape
                best.mean_mae = debug.mean_mae
        if best and best.mean_mape < 0.08:
            break

    logger.info("%s SARIMAX-exog: evaluated %d, best=%.4f",
                metric, evaluated, best.mean_mape if best else float("inf"))
    return best


def _make_baseline_candidate(name: str, score: float, warnings: list[str] | None = None) -> ModelCandidate:
    return ModelCandidate(
        model_name=name,
        params={"window": 7} if name == "ma7" else {"lookback_weeks": 8},
        transform_name="identity",
        mean_mape=score,
        is_valid=True,
        warnings=warnings or [],
        model_family=MODEL_FAMILY_BASELINE,
    )


def _evaluate_two_stage(
    ts: TimeSeries, base_series, hp, ep, horizon, step, timed_out,
) -> Optional[ModelCandidate]:
    """Evaluate two-stage revenue = bookings * avg_check."""
    try:
        from avg_check import compute_avg_check_series
        from two_stage import evaluate_two_stage_candidate

        if not base_series or "bookings" not in base_series:
            logger.info("two_stage: bookings series not available, skipping")
            return ModelCandidate(
                model_name="two_stage", params={}, transform_name="composed",
                mean_mape=float("inf"), is_valid=False,
                warnings=["no_bookings_series"], model_family=MODEL_FAMILY_TWO_STAGE,
                composed=True,
            )

        bookings_ts = base_series["bookings"]
        revenue_ts = base_series.get("revenue", ts)
        avg_check_ts = compute_avg_check_series(revenue_ts, bookings_ts)

        if len(avg_check_ts) < TWO_STAGE_MIN_HISTORY_DAYS:
            logger.info("two_stage: avg_check too short (%d days), skipping", len(avg_check_ts))
            return ModelCandidate(
                model_name="two_stage", params={}, transform_name="composed",
                mean_mape=float("inf"), is_valid=False,
                warnings=["avg_check_too_short"], model_family=MODEL_FAMILY_TWO_STAGE,
                composed=True,
            )

        import config as _cfg_ts
        remaining = max(_cfg_ts.TWO_STAGE_TIMEOUT_SECONDS, 10)
        cand = evaluate_two_stage_candidate(
            revenue_ts, bookings_ts, avg_check_ts,
            horizon=horizon, step=step,
            base_series=base_series,
            holiday_provider=hp, event_provider=ep,
            timeout_seconds=remaining,
        )

        logger.info(
            "two_stage evaluation: valid=%s smape=%.4f mape=%.4f",
            cand.is_valid,
            cand.mean_smape if cand.mean_smape else float("inf"),
            cand.mean_mape,
        )
        return cand

    except Exception as e:
        logger.warning("two_stage evaluation failed: %s", e)
        return ModelCandidate(
            model_name="two_stage", params={"error": str(e)}, transform_name="composed",
            mean_mape=float("inf"), is_valid=False,
            warnings=[f"evaluation_error: {e}"], model_family=MODEL_FAMILY_TWO_STAGE,
            composed=True,
        )


def _evaluate_ensemble(
    ts: TimeSeries,
    all_candidates: list,
    horizon: int,
    step: int,
    base_series,
    hp, ep,
    best_bl_score: float,
    best_bl_smape: float,
) -> Optional[ModelCandidate]:
    """Build a weighted ensemble from valid single-family candidates."""
    try:
        from ensemble import backtest_ensemble

        eligible_families = set(ENSEMBLE_CANDIDATES)
        member_cands: dict[str, ModelCandidate] = {}
        for cand, _ in all_candidates:
            fam = cand.model_family
            if fam in eligible_families and cand.is_valid:
                if fam not in member_cands or cand.mean_mape < member_cands[fam].mean_mape:
                    member_cands[fam] = cand

        if len(member_cands) < 2:
            logger.info("ensemble: only %d valid member families, need >=2, skipping", len(member_cands))
            return ModelCandidate(
                model_name="ensemble", params={}, transform_name="ensemble",
                mean_mape=float("inf"), is_valid=False,
                warnings=["too_few_members"], model_family=MODEL_FAMILY_ENSEMBLE,
            )

        import config as _cfg_ens
        remaining = max(_cfg_ens.ENSEMBLE_TIMEOUT_SEC, 10)
        result = backtest_ensemble(
            ts, member_cands, horizon, step,
            mode=ENSEMBLE_WEIGHT_MODE,
            base_series=base_series,
            holiday_provider=hp, event_provider=ep,
            timeout_seconds=remaining,
        )

        if not result.get("valid"):
            return ModelCandidate(
                model_name="ensemble", params={"reason": result.get("reason")},
                transform_name="ensemble", mean_mape=float("inf"), is_valid=False,
                warnings=[result.get("reason", "backtest_failed")],
                model_family=MODEL_FAMILY_ENSEMBLE,
            )

        ens_smape = result["mean_smape"]
        ens_mape = result["mean_mape"]

        cand = ModelCandidate(
            model_name="ensemble",
            params={
                "members": result["members"],
                "weights": result["weights"],
                "mode": result["mode"],
                "member_mean_smapes": result.get("member_mean_smapes", {}),
            },
            transform_name="ensemble",
            backtest_scores=result.get("fold_smapes", []),
            mean_mape=ens_mape,
            mean_smape=ens_smape,
            is_valid=True,
            model_family=MODEL_FAMILY_ENSEMBLE,
            ensemble_weights=result["weights"],
            ensemble_members=result["members"],
        )

        logger.info(
            "ensemble evaluation: smape=%.4f mape=%.4f members=%s",
            ens_smape, ens_mape, result["members"],
        )
        return cand

    except Exception as e:
        logger.warning("ensemble evaluation failed: %s", e)
        return ModelCandidate(
            model_name="ensemble", params={"error": str(e)},
            transform_name="ensemble", mean_mape=float("inf"), is_valid=False,
            warnings=[f"evaluation_error: {e}"], model_family=MODEL_FAMILY_ENSEMBLE,
        )


def _record(cand: ModelCandidate, metric: str) -> None:
    try:
        record_run(RegistryRun(
            metric_name=metric,
            model_family=cand.model_family or cand.model_name,
            params=cand.params,
            transform_name=cand.transform_name,
            mean_error=cand.mean_mape,
            fold_errors=cand.backtest_scores,
            diagnostics=cand.diagnostics,
        ))
    except Exception:
        pass
