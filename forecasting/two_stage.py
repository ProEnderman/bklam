"""Two-stage (factorized) revenue model: revenue = bookings * avg_check.

Forecasts bookings and avg_check independently using the existing selector,
then composes a revenue forecast from the two components.
"""

from __future__ import annotations

import logging
import time
from collections import Counter
from typing import Any, Optional

import numpy as np
import pandas as pd

from types_ import TimeSeries, ForecastResult, ModelCandidate
from transforms import get_transform
from backtest import compute_folds
from metrics import mape as mape_fn, smape as smape_fn, mae as mae_fn
from diagnostics import explosion_guard
from config import (
    BACKTEST_HORIZON_DAYS,
    BACKTEST_STEP_DAYS,
    MAPE_CAP_FOR_SELECTOR,
    EXPLOSION_LOOKBACK_DAYS,
    MODEL_FAMILY_TWO_STAGE,
    TWO_STAGE_MIN_HISTORY_DAYS,
    TWO_STAGE_USE_LOG_COMPOSITION,
    TWO_STAGE_AVG_CHECK_CLIP,
    TWO_STAGE_INTERVAL_MODE,
    TWO_STAGE_TIMEOUT_SECONDS,
    TWO_STAGE_INNER_SARIMA_CAP,
    TWO_STAGE_INNER_PROPHET_CAP,
    TWO_STAGE_INNER_EXOG_CAP,
    SELECTOR_TIMEOUT_SECONDS,
)

logger = logging.getLogger(__name__)

_EPS = 1e-8


# ────────────────────────────────────────────────────────
#  A) Forecast composition
# ────────────────────────────────────────────────────────

def compose_revenue_forecast(
    bookings_yhat: np.ndarray,
    bookings_lower: np.ndarray,
    bookings_upper: np.ndarray,
    avg_check_yhat: np.ndarray,
    avg_check_lower: np.ndarray,
    avg_check_upper: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Compose revenue = bookings * avg_check with interval propagation."""
    bk = np.maximum(np.asarray(bookings_yhat, dtype=np.float64), _EPS)
    ac = np.maximum(np.asarray(avg_check_yhat, dtype=np.float64), _EPS)

    if TWO_STAGE_USE_LOG_COMPOSITION:
        yhat = np.exp(np.log(bk) + np.log(ac))
    else:
        yhat = bk * ac

    bk_lo = np.maximum(np.asarray(bookings_lower, dtype=np.float64), _EPS)
    bk_hi = np.maximum(np.asarray(bookings_upper, dtype=np.float64), _EPS)
    ac_lo = np.maximum(np.asarray(avg_check_lower, dtype=np.float64), _EPS)
    ac_hi = np.maximum(np.asarray(avg_check_upper, dtype=np.float64), _EPS)

    if TWO_STAGE_INTERVAL_MODE == "conservative":
        lower = bk_lo * ac_lo
        upper = bk_hi * ac_hi
    else:
        lower = bk * ac * 0.8
        upper = bk * ac * 1.2

    yhat = np.maximum(yhat, 0.0)
    lower = np.minimum(lower, yhat)
    upper = np.maximum(upper, yhat)

    return yhat, lower, upper


# ────────────────────────────────────────────────────────
#  B) Rolling backtest for two-stage
# ────────────────────────────────────────────────────────

def backtest_two_stage_revenue(
    revenue_ts: TimeSeries,
    bookings_ts: TimeSeries,
    avg_check_ts: TimeSeries,
    horizon: int = BACKTEST_HORIZON_DAYS,
    step: int = BACKTEST_STEP_DAYS,
    base_series: Optional[dict[str, TimeSeries]] = None,
    holiday_provider=None,
    event_provider=None,
    timeout_seconds: float = TWO_STAGE_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Run rolling backtest of two-stage revenue = bookings * avg_check.

    Strategy: select component models ONCE on the full training data,
    then apply those fixed model configs to each backtest fold (same approach
    as evaluate_candidate does for single models). This avoids the O(n_folds *
    n_candidates * n_inner_folds) blowup.
    """
    from selector import select_model
    import config as cfg

    n = len(revenue_ts)
    folds = compute_folds(n, horizon, step)

    if not folds:
        return {"valid": False, "reason": "no_folds"}

    start_time = time.time()

    # Phase 1: quick model selection on full series (done once)
    saved_timeout = cfg.SELECTOR_TIMEOUT_SECONDS
    cfg.SELECTOR_TIMEOUT_SECONDS = max(timeout_seconds * 0.35, 15)
    try:
        bk_cand = select_model(
            bookings_ts, "bookings",
            horizon=horizon, step=step,
            max_candidates_sarima=TWO_STAGE_INNER_SARIMA_CAP,
            max_candidates_prophet=TWO_STAGE_INNER_PROPHET_CAP,
            max_candidates_exog=TWO_STAGE_INNER_EXOG_CAP,
            base_series=base_series,
            holiday_provider=holiday_provider,
            event_provider=event_provider,
        )
        ac_cand = select_model(
            avg_check_ts, "avg_check",
            horizon=horizon, step=step,
            max_candidates_sarima=TWO_STAGE_INNER_SARIMA_CAP,
            max_candidates_prophet=TWO_STAGE_INNER_PROPHET_CAP,
            max_candidates_exog=TWO_STAGE_INNER_EXOG_CAP,
            base_series=base_series,
            holiday_provider=holiday_provider,
            event_provider=event_provider,
        )
    finally:
        cfg.SELECTOR_TIMEOUT_SECONDS = saved_timeout

    component_families = {
        "bookings": {bk_cand.model_family or bk_cand.model_name: 1},
        "avg_check": {ac_cand.model_family or ac_cand.model_name: 1},
    }

    logger.info(
        "two_stage phase 1: bookings=%s(%.4f) avg_check=%s(%.4f) in %.1fs",
        bk_cand.model_family, bk_cand.mean_mape,
        ac_cand.model_family, ac_cand.mean_mape,
        time.time() - start_time,
    )

    # Phase 2: evaluate these fixed models across backtest folds
    fold_smapes: list[float] = []
    fold_mapes: list[float] = []
    fold_maes: list[float] = []
    fold_failures: list[str] = []

    for fold_i, (train_end, test_end) in enumerate(folds):
        if (time.time() - start_time) > timeout_seconds:
            fold_failures.append(f"fold_{fold_i}_timeout")
            break

        test_revenue = revenue_ts.values[train_end:test_end]
        h = len(test_revenue)

        bk_train = bookings_ts.slice(0, min(train_end, len(bookings_ts)))
        ac_train = avg_check_ts.slice(0, min(train_end, len(avg_check_ts)))

        if len(bk_train) < 90 or len(ac_train) < 90:
            fold_smapes.append(MAPE_CAP_FOR_SELECTOR)
            fold_mapes.append(MAPE_CAP_FOR_SELECTOR)
            fold_maes.append(float("inf"))
            fold_failures.append(f"fold_{fold_i}_insufficient_data")
            continue

        bk_fc = _produce_forecast(bk_train, bk_cand, h, "bookings")
        ac_fc = _produce_forecast(ac_train, ac_cand, h, "avg_check")

        if bk_fc is None or ac_fc is None:
            fold_smapes.append(MAPE_CAP_FOR_SELECTOR)
            fold_mapes.append(MAPE_CAP_FOR_SELECTOR)
            fold_maes.append(float("inf"))
            fold_failures.append(f"fold_{fold_i}_forecast_failed")
            continue

        rev_yhat, rev_lo, rev_hi = compose_revenue_forecast(
            bk_fc[0], bk_fc[1], bk_fc[2],
            ac_fc[0], ac_fc[1], ac_fc[2],
        )

        lookback = min(EXPLOSION_LOOKBACK_DAYS, train_end)
        recent = revenue_ts.values[train_end - lookback:train_end]
        guard = explosion_guard(rev_yhat, recent)
        if guard["explosion_guard_triggered"]:
            fold_smapes.append(MAPE_CAP_FOR_SELECTOR)
            fold_mapes.append(MAPE_CAP_FOR_SELECTOR)
            fold_maes.append(float("inf"))
            fold_failures.append(f"fold_{fold_i}_explosion")
            continue

        rev_clip = rev_yhat[:len(test_revenue)]
        s = smape_fn(test_revenue, rev_clip)
        m = mape_fn(test_revenue, rev_clip)
        a = mae_fn(test_revenue, rev_clip)
        fold_smapes.append(min(s, MAPE_CAP_FOR_SELECTOR) if np.isfinite(s) else MAPE_CAP_FOR_SELECTOR)
        fold_mapes.append(min(m, MAPE_CAP_FOR_SELECTOR) if np.isfinite(m) else MAPE_CAP_FOR_SELECTOR)
        fold_maes.append(a if np.isfinite(a) else float("inf"))

    n_folds_done = len(fold_smapes)
    if n_folds_done == 0:
        return {"valid": False, "reason": "no_completed_folds", "failures": fold_failures}

    n_failed = sum(1 for s in fold_smapes if s >= MAPE_CAP_FOR_SELECTOR)
    fail_rate = n_failed / max(n_folds_done, 1)

    return {
        "valid": True,
        "mean_smape": float(np.mean(fold_smapes)),
        "mean_mape": float(np.mean(fold_mapes)),
        "mean_mae": float(np.mean(fold_maes)),
        "fold_smapes": [round(x, 6) for x in fold_smapes],
        "fold_mapes": [round(x, 6) for x in fold_mapes],
        "n_folds": n_folds_done,
        "n_failed": n_failed,
        "fail_rate": round(fail_rate, 3),
        "component_families": component_families,
        "component_models": {
            "bookings": {"family": bk_cand.model_family, "params": bk_cand.params, "error": round(bk_cand.mean_mape, 6)},
            "avg_check": {"family": ac_cand.model_family, "params": ac_cand.params, "error": round(ac_cand.mean_mape, 6)},
        },
        "failures": fold_failures,
        "elapsed_seconds": round(time.time() - start_time, 1),
    }


def _produce_forecast(
    ts: TimeSeries, cand: ModelCandidate, horizon: int, metric: str,
) -> Optional[tuple[np.ndarray, np.ndarray, np.ndarray]]:
    """Generate a point forecast + intervals from a selected candidate."""
    from baselines import forecast_ma7, forecast_same_day_last_week
    from sarima import fit_forecast_sarima
    from transforms import get_transform

    transform = get_transform(metric)
    name = cand.model_name

    try:
        if name == "ma7":
            fr = forecast_ma7(ts, horizon)
            return np.array(fr.yhat), np.array(fr.yhat_lower), np.array(fr.yhat_upper)
        elif name == "same_day_last_week":
            fr = forecast_same_day_last_week(ts, horizon)
            return np.array(fr.yhat), np.array(fr.yhat_lower), np.array(fr.yhat_upper)
        elif name in ("sarima", "sarimax_exog"):
            params = cand.params
            order = tuple(params.get("order", [0, 0, 0]))
            seasonal = tuple(params.get("seasonal_order", [1, 0, 1, 7]))
            y_t = transform.forward(ts.values)
            yhat_t, lo_t, hi_t, _ = fit_forecast_sarima(y_t, order, seasonal, horizon)
            if yhat_t is None:
                return None
            yhat = transform.inverse(yhat_t)
            lo, hi = transform.inverse_interval(lo_t, hi_t)
            return yhat, lo, hi
        elif name == "prophet":
            from prophet_model import fit_forecast_prophet
            config = {k: v for k, v in cand.params.items() if k != "config_idx"}
            yhat, lo, hi, _ = fit_forecast_prophet(ts, transform, horizon, config=config)
            if yhat is None:
                return None
            return yhat, lo, hi
        else:
            fr = forecast_ma7(ts, horizon)
            return np.array(fr.yhat), np.array(fr.yhat_lower), np.array(fr.yhat_upper)
    except Exception as e:
        logger.debug("two_stage _produce_forecast(%s, %s) failed: %s", metric, name, e)
        return None


# ────────────────────────────────────────────────────────
#  C) Candidate evaluation wrapper
# ────────────────────────────────────────────────────────

def evaluate_two_stage_candidate(
    revenue_ts: TimeSeries,
    bookings_ts: TimeSeries,
    avg_check_ts: TimeSeries,
    horizon: int = BACKTEST_HORIZON_DAYS,
    step: int = BACKTEST_STEP_DAYS,
    base_series: Optional[dict[str, TimeSeries]] = None,
    holiday_provider=None,
    event_provider=None,
    timeout_seconds: float = TWO_STAGE_TIMEOUT_SECONDS,
) -> ModelCandidate:
    """Evaluate two-stage revenue model and return a ModelCandidate."""

    if len(revenue_ts) < TWO_STAGE_MIN_HISTORY_DAYS:
        return ModelCandidate(
            model_name="two_stage", params={}, transform_name="composed",
            mean_mape=float("inf"), is_valid=False,
            warnings=["insufficient_history"], model_family=MODEL_FAMILY_TWO_STAGE,
            composed=True,
        )

    bt = backtest_two_stage_revenue(
        revenue_ts, bookings_ts, avg_check_ts,
        horizon=horizon, step=step,
        base_series=base_series,
        holiday_provider=holiday_provider,
        event_provider=event_provider,
        timeout_seconds=timeout_seconds,
    )

    if not bt.get("valid"):
        return ModelCandidate(
            model_name="two_stage", params={"reason": bt.get("reason")},
            transform_name="composed",
            mean_mape=float("inf"), is_valid=False,
            warnings=["backtest_invalid"], model_family=MODEL_FAMILY_TWO_STAGE,
            composed=True,
        )

    mean_smape = bt["mean_smape"]
    mean_mape = bt["mean_mape"]
    mean_mae = bt["mean_mae"]
    fold_scores = bt["fold_smapes"]
    fail_rate = bt["fail_rate"]

    is_valid = (
        mean_smape < MAPE_CAP_FOR_SELECTOR
        and fail_rate <= 0.10
        and bt["n_folds"] >= 3
    )

    warnings = []
    if fail_rate > 0.10:
        warnings.append(f"high_fail_rate_{fail_rate:.2f}")
    if bt["n_folds"] < 6:
        warnings.append(f"few_folds_{bt['n_folds']}")
    warnings.extend(bt.get("failures", []))

    return ModelCandidate(
        model_name="two_stage",
        params={
            "composition": "log" if TWO_STAGE_USE_LOG_COMPOSITION else "multiplicative",
            "interval_mode": TWO_STAGE_INTERVAL_MODE,
            "component_families": bt.get("component_families", {}),
            "n_folds": bt["n_folds"],
            "n_failed": bt["n_failed"],
        },
        transform_name="composed",
        backtest_scores=fold_scores,
        mean_mape=mean_mape,
        mean_smape=mean_smape,
        mean_mae=mean_mae,
        diagnostics={
            "fail_rate": fail_rate,
            "elapsed_seconds": bt.get("elapsed_seconds"),
            "component_families": bt.get("component_families", {}),
        },
        is_valid=is_valid,
        warnings=warnings,
        model_family=MODEL_FAMILY_TWO_STAGE,
        composed=True,
        component_models=bt.get("component_families"),
    )


# ────────────────────────────────────────────────────────
#  D) Production forecast
# ────────────────────────────────────────────────────────

def forecast_two_stage_revenue(
    revenue_ts: TimeSeries,
    bookings_ts: TimeSeries,
    avg_check_ts: TimeSeries,
    horizon: int,
    base_series: Optional[dict[str, TimeSeries]] = None,
    holiday_provider=None,
    event_provider=None,
) -> Optional[ForecastResult]:
    """Generate a production two-stage revenue forecast."""
    from selector import select_model
    import config as cfg

    saved_timeout = cfg.SELECTOR_TIMEOUT_SECONDS
    cfg.SELECTOR_TIMEOUT_SECONDS = max(TWO_STAGE_TIMEOUT_SECONDS * 0.5, 15)

    try:
        bk_cand = select_model(
            bookings_ts, "bookings",
            max_candidates_sarima=TWO_STAGE_INNER_SARIMA_CAP,
            max_candidates_prophet=TWO_STAGE_INNER_PROPHET_CAP,
            max_candidates_exog=TWO_STAGE_INNER_EXOG_CAP,
            base_series=base_series,
            holiday_provider=holiday_provider,
            event_provider=event_provider,
        )

        ac_cand = select_model(
            avg_check_ts, "avg_check",
            max_candidates_sarima=TWO_STAGE_INNER_SARIMA_CAP,
            max_candidates_prophet=TWO_STAGE_INNER_PROPHET_CAP,
            max_candidates_exog=TWO_STAGE_INNER_EXOG_CAP,
            base_series=base_series,
            holiday_provider=holiday_provider,
            event_provider=event_provider,
        )
    finally:
        cfg.SELECTOR_TIMEOUT_SECONDS = saved_timeout

    bk_fc = _produce_forecast(bookings_ts, bk_cand, horizon, "bookings")
    ac_fc = _produce_forecast(avg_check_ts, ac_cand, horizon, "avg_check")

    if bk_fc is None or ac_fc is None:
        logger.warning("two_stage: component forecast failed, returning None")
        return None

    rev_yhat, rev_lo, rev_hi = compose_revenue_forecast(
        bk_fc[0], bk_fc[1], bk_fc[2],
        ac_fc[0], ac_fc[1], ac_fc[2],
    )

    lookback = min(EXPLOSION_LOOKBACK_DAYS, len(revenue_ts))
    recent = revenue_ts.values[-lookback:]
    guard = explosion_guard(rev_yhat, recent)
    if guard["explosion_guard_triggered"]:
        logger.warning("two_stage: production forecast triggered explosion guard")
        return None

    rev_yhat = np.maximum(rev_yhat, 0.0)
    rev_lo = np.minimum(rev_lo, rev_yhat)
    rev_hi = np.maximum(rev_hi, rev_yhat)

    last_date = revenue_ts.dates[-1]
    dates = [(last_date + pd.Timedelta(days=i + 1)).strftime("%Y-%m-%d") for i in range(horizon)]

    return ForecastResult(
        dates=dates,
        yhat=[round(float(v), 2) for v in rev_yhat],
        yhat_lower=[round(float(v), 2) for v in rev_lo],
        yhat_upper=[round(float(v), 2) for v in rev_hi],
        model_name="two_stage",
        model_family=MODEL_FAMILY_TWO_STAGE,
        params={
            "composition": "log" if TWO_STAGE_USE_LOG_COMPOSITION else "multiplicative",
            "bookings_model": bk_cand.model_family or bk_cand.model_name,
            "avg_check_model": ac_cand.model_family or ac_cand.model_name,
        },
        transform_name="composed",
        train_end=last_date.strftime("%Y-%m-%d"),
        composed_from="bookings*avg_check",
        components={
            "bookings": {
                "model_family": bk_cand.model_family or bk_cand.model_name,
                "mean_error": round(bk_cand.mean_mape, 6) if bk_cand.mean_mape < float("inf") else None,
                "yhat": [round(float(v), 2) for v in bk_fc[0]],
                "lower": [round(float(v), 2) for v in bk_fc[1]],
                "upper": [round(float(v), 2) for v in bk_fc[2]],
            },
            "avg_check": {
                "model_family": ac_cand.model_family or ac_cand.model_name,
                "mean_error": round(ac_cand.mean_mape, 6) if ac_cand.mean_mape < float("inf") else None,
                "yhat": [round(float(v), 2) for v in ac_fc[0]],
                "lower": [round(float(v), 2) for v in ac_fc[1]],
                "upper": [round(float(v), 2) for v in ac_fc[2]],
            },
        },
    )
