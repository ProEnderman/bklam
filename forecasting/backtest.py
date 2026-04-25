"""Rolling-origin backtest engine with debug reporting and adaptive explosion guard."""

from __future__ import annotations

import logging
from typing import Any, Callable, List, Optional, Tuple

import numpy as np

from types_ import TimeSeries, ModelCandidate, BacktestFoldReport, BacktestDebugReport
from transforms import Transform
from metrics import mape as mape_fn, smape as smape_fn, mae as mae_fn, score_by_name
from diagnostics import explosion_guard
from config import (
    BACKTEST_HORIZON_DAYS,
    BACKTEST_STEP_DAYS,
    BACKTEST_MIN_FOLDS,
    MIN_HISTORY_DAYS,
    MAPE_CAP_FOR_SELECTOR,
    EXPLOSION_LOOKBACK_DAYS,
    DEBUG_BACKTEST,
    METRIC_OPTIMIZATION,
)

logger = logging.getLogger(__name__)

FitForecastFn = Callable[
    [np.ndarray, int],
    Tuple[Optional[np.ndarray], Optional[np.ndarray], Optional[np.ndarray], dict[str, Any]],
]


def compute_folds(
    n: int,
    horizon: int = BACKTEST_HORIZON_DAYS,
    step: int = BACKTEST_STEP_DAYS,
    min_train: int = MIN_HISTORY_DAYS,
) -> List[Tuple[int, int]]:
    """Deterministic fold boundaries: list of (train_end_idx, test_end_idx)."""
    folds = []
    latest_possible = n - horizon
    cursor = latest_possible

    while cursor >= min_train and len(folds) < 20:
        folds.append((cursor, cursor + horizon))
        cursor -= step

    folds.reverse()
    return folds


def _actuals_summary(vals: np.ndarray) -> dict[str, Any]:
    if len(vals) == 0:
        return {"min": None, "median": None, "max": None, "count_near_zero": 0, "n": 0}
    return {
        "min": round(float(np.min(vals)), 2),
        "median": round(float(np.median(vals)), 2),
        "max": round(float(np.max(vals)), 2),
        "mean": round(float(np.mean(vals)), 2),
        "count_near_zero": int(np.sum(np.abs(vals) < 1.0)),
        "n": len(vals),
    }


def rolling_backtest(
    ts: TimeSeries,
    transform: Transform,
    fit_forecast_fn: FitForecastFn,
    metric_name: str = "unknown",
    model_name: str = "unknown",
    params: dict | None = None,
    horizon: int = BACKTEST_HORIZON_DAYS,
    step: int = BACKTEST_STEP_DAYS,
) -> Tuple[List[float], dict[str, Any], Optional[BacktestDebugReport]]:
    """
    Run rolling-origin backtest.

    Returns (list_of_primary_scores, summary_diag, debug_report_or_None).
    The primary score metric is chosen per METRIC_OPTIMIZATION config.
    """
    n = len(ts)
    folds = compute_folds(n, horizon, step)
    opt_metric = METRIC_OPTIMIZATION.get(metric_name, "mape")

    debug = BacktestDebugReport(
        metric=metric_name,
        model_name=model_name,
        params=params or {},
        transform_name=transform.name,
        n_folds=len(folds),
    ) if DEBUG_BACKTEST else None

    if len(folds) < BACKTEST_MIN_FOLDS:
        return [], {"error": f"only {len(folds)} folds, need {BACKTEST_MIN_FOLDS}"}, debug

    scores: List[float] = []
    all_mapes: List[float] = []
    all_smapes: List[float] = []
    all_maes: List[float] = []
    all_diag: dict[str, Any] = {"folds": len(folds), "warnings": []}

    for fold_i, (train_end, test_end) in enumerate(folds):
        train_vals = ts.values[:train_end]
        test_vals = ts.values[train_end:test_end]

        fold_report = BacktestFoldReport(
            fold_index=fold_i,
            train_start=str(ts.dates[0].date()),
            train_end=str(ts.dates[train_end - 1].date()),
            test_start=str(ts.dates[train_end].date()),
            test_end=str(ts.dates[min(test_end, n) - 1].date()),
            last_7_train_actuals=[round(float(v), 2) for v in train_vals[-7:]],
            test_actuals_summary=_actuals_summary(test_vals),
            pred_summary={},
        )

        y_train_t = transform.forward(train_vals)
        yhat_t, lower_t, upper_t, diag = fit_forecast_fn(y_train_t, len(test_vals))

        if yhat_t is None:
            fold_report.rejection_reason = "fit_failed"
            all_diag["warnings"].append(f"fold_{fold_i}_fit_failed")
            scores.append(MAPE_CAP_FOR_SELECTOR)
            all_mapes.append(MAPE_CAP_FOR_SELECTOR)
            all_smapes.append(MAPE_CAP_FOR_SELECTOR)
            all_maes.append(float("inf"))
            if debug:
                debug.folds.append(fold_report)
            continue

        yhat = transform.inverse(yhat_t)
        fold_report.pred_summary = _actuals_summary(yhat)

        # Adaptive explosion guard: use last 56 days (or available)
        lookback = min(EXPLOSION_LOOKBACK_DAYS, len(train_vals))
        recent = train_vals[-lookback:]
        guard = explosion_guard(yhat, recent)
        if guard["explosion_guard_triggered"]:
            fold_report.rejection_reason = f"explosion_guard: fc_max={guard['forecast_max']}, thresh_max={guard['thresh_max']}, thresh_p90={guard['thresh_p90']}"
            all_diag["warnings"].append(f"fold_{fold_i}_explosion")
            scores.append(MAPE_CAP_FOR_SELECTOR)
            all_mapes.append(MAPE_CAP_FOR_SELECTOR)
            all_smapes.append(MAPE_CAP_FOR_SELECTOR)
            all_maes.append(float("inf"))
            if debug:
                debug.folds.append(fold_report)
            continue

        yhat_clipped = yhat[:len(test_vals)]
        f_mape = mape_fn(test_vals, yhat_clipped)
        f_smape = smape_fn(test_vals, yhat_clipped)
        f_mae = mae_fn(test_vals, yhat_clipped)

        fold_report.fold_mape = round(f_mape, 6) if np.isfinite(f_mape) else None
        fold_report.fold_smape = round(f_smape, 6) if np.isfinite(f_smape) else None
        fold_report.fold_mae = round(f_mae, 4) if np.isfinite(f_mae) else None

        # Primary score for selection
        primary = score_by_name(opt_metric, test_vals, yhat_clipped)
        if not np.isfinite(primary):
            primary = MAPE_CAP_FOR_SELECTOR

        scores.append(min(primary, MAPE_CAP_FOR_SELECTOR))
        all_mapes.append(f_mape if np.isfinite(f_mape) else MAPE_CAP_FOR_SELECTOR)
        all_smapes.append(f_smape if np.isfinite(f_smape) else MAPE_CAP_FOR_SELECTOR)
        all_maes.append(f_mae if np.isfinite(f_mae) else float("inf"))

        if debug:
            debug.folds.append(fold_report)

    if debug:
        debug.mean_mape = round(float(np.mean(all_mapes)), 6) if all_mapes else None
        debug.mean_smape = round(float(np.mean(all_smapes)), 6) if all_smapes else None
        debug.mean_mae = round(float(np.mean(all_maes)), 4) if all_maes else None

    return scores, all_diag, debug


def evaluate_candidate(
    ts: TimeSeries,
    transform: Transform,
    fit_forecast_fn: FitForecastFn,
    model_name: str,
    params: dict,
    metric_name: str = "unknown",
    horizon: int = BACKTEST_HORIZON_DAYS,
    step: int = BACKTEST_STEP_DAYS,
) -> Tuple[ModelCandidate, Optional[BacktestDebugReport]]:
    """Evaluate a single model candidate via rolling backtest."""
    scores, diag, debug = rolling_backtest(
        ts, transform, fit_forecast_fn,
        metric_name=metric_name,
        model_name=model_name,
        params=params,
        horizon=horizon,
        step=step,
    )

    candidate = ModelCandidate(
        model_name=model_name,
        params=params,
        transform_name=transform.name,
        backtest_scores=scores,
        mean_mape=float(np.mean(scores)) if scores else float("inf"),
        diagnostics=diag,
        is_valid=len(scores) >= BACKTEST_MIN_FOLDS,
        warnings=diag.get("warnings", []),
    )

    if candidate.mean_mape >= MAPE_CAP_FOR_SELECTOR:
        candidate.is_valid = False
        candidate.warnings.append("score_exceeds_cap")

    return candidate, debug
