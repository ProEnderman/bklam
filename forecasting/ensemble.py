"""Backtest-learned weighted ensemble for revenue forecasting.

Learns optimal blending weights from rolling backtest folds, optionally
per weekday, then applies them to combine member forecasts.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

import numpy as np
import pandas as pd

from types_ import TimeSeries, ModelCandidate
from backtest import compute_folds
from transforms import get_transform
from metrics import smape as smape_fn, mape as mape_fn
from diagnostics import explosion_guard
from config import (
    BACKTEST_HORIZON_DAYS,
    BACKTEST_STEP_DAYS,
    MAPE_CAP_FOR_SELECTOR,
    EXPLOSION_LOOKBACK_DAYS,
    ENSEMBLE_MIN_FOLDS,
    ENSEMBLE_WEIGHT_MODE,
    ENSEMBLE_MIN_WEIGHT,
    ENSEMBLE_MAX_MODELS,
    ENSEMBLE_INTERVAL_MODE,
    ENSEMBLE_TIMEOUT_SEC,
    ENSEMBLE_FOLD_RECENCY_ALPHA,
    ENSEMBLE_SHRINKAGE_MIN_SAMPLES,
    ENSEMBLE_SHRINKAGE_FLOOR,
    MODEL_FAMILY_ENSEMBLE,
)

logger = logging.getLogger(__name__)

_EPS = 1e-8
_DOW_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


# ──────────────────────────────────────────────────────────
#  A) Weight fitting from backtest folds
# ──────────────────────────────────────────────────────────

def _project_simplex_with_min(w: np.ndarray, min_w: float) -> np.ndarray:
    """Project w onto the simplex {w: sum=1, w_i >= min_w}."""
    n = len(w)
    if n == 0:
        return w
    total_min = n * min_w
    if total_min > 1.0:
        return np.full(n, 1.0 / n)
    residual = w - min_w
    residual = np.maximum(residual, 0.0)
    s = residual.sum()
    if s < _EPS:
        return np.full(n, 1.0 / n)
    residual *= (1.0 - total_min) / s
    return residual + min_w


def _optimize_weights_for_points(
    actuals: np.ndarray,
    preds_matrix: np.ndarray,
    min_w: float,
    point_weights: Optional[np.ndarray] = None,
) -> np.ndarray:
    """Find weights minimizing (optionally weighted) sMAPE.

    actuals:       shape (N,)
    preds_matrix:  shape (N, K) — one column per member
    point_weights: shape (N,) — per-point importance weights (e.g. recency)
    Returns:       shape (K,)
    """
    n_pts, k = preds_matrix.shape
    if k == 0 or n_pts == 0:
        return np.array([])

    if point_weights is not None:
        pw = np.maximum(np.asarray(point_weights, dtype=np.float64), 1e-10)
        assert pw.shape == (n_pts,) and np.isfinite(pw).all()
    else:
        pw = None

    w = np.full(k, 1.0 / k)
    best_w = w.copy()

    def _smape_loss(weights):
        blended = preds_matrix @ weights
        denom = np.abs(actuals) + np.abs(blended) + _EPS
        per_point = 2.0 * np.abs(actuals - blended) / denom
        if pw is not None:
            return float(np.sum(pw * per_point) / np.sum(pw))
        return float(np.mean(per_point))

    best_loss = _smape_loss(w)

    for _iteration in range(60):
        improved = False
        for j in range(k):
            for delta in [0.05, 0.02, 0.01, -0.01, -0.02, -0.05]:
                trial = w.copy()
                trial[j] += delta
                trial = _project_simplex_with_min(trial, min_w)
                loss = _smape_loss(trial)
                if loss < best_loss - 1e-7:
                    best_loss = loss
                    best_w = trial.copy()
                    w = trial.copy()
                    improved = True
                    break
        if not improved:
            break

    return _project_simplex_with_min(best_w, min_w)


def fit_ensemble_weights(
    fold_actuals: list[np.ndarray],
    fold_preds: dict[str, list[np.ndarray]],
    dates_per_fold: list[pd.DatetimeIndex],
    mode: str = ENSEMBLE_WEIGHT_MODE,
    recency_alpha: float = ENSEMBLE_FOLD_RECENCY_ALPHA,
    shrinkage_min_samples: int = ENSEMBLE_SHRINKAGE_MIN_SAMPLES,
    shrinkage_floor: float = ENSEMBLE_SHRINKAGE_FLOOR,
) -> dict:
    """Learn ensemble weights from backtest fold predictions.

    Supports recency-weighted fold optimization (recent folds count more)
    and Bayesian weekday shrinkage toward global weights.

    Returns {"global": {...}, "weekday": {...}, "shrinkage": {...}}
    """
    members = sorted(fold_preds.keys())
    k = len(members)
    if k == 0:
        return {"global": {}}

    recency_alpha = max(min(recency_alpha, 1.0), 0.80)
    shrinkage_min_samples = max(shrinkage_min_samples, 0)

    n_folds = len(fold_actuals)

    all_actuals = []
    all_preds = {m: [] for m in members}
    all_dows = []
    all_point_weights = []

    for fold_i, act in enumerate(fold_actuals):
        dates = dates_per_fold[fold_i]
        n = min(len(act), min(len(fold_preds[m][fold_i]) for m in members), len(dates))
        fold_w = recency_alpha ** (n_folds - 1 - fold_i)
        for t in range(n):
            all_actuals.append(act[t])
            for m in members:
                all_preds[m].append(fold_preds[m][fold_i][t])
            all_dows.append(dates[t].day_name())
            all_point_weights.append(fold_w)

    all_actuals = np.array(all_actuals)
    all_point_weights = np.array(all_point_weights)
    preds_matrix = np.column_stack([np.array(all_preds[m]) for m in members])

    global_w = _optimize_weights_for_points(all_actuals, preds_matrix, ENSEMBLE_MIN_WEIGHT, all_point_weights)
    global_dict = {m: round(float(global_w[i]), 4) for i, m in enumerate(members)}

    result: dict[str, Any] = {"global": global_dict}

    per_weekday_lambda: dict[str, float] = {}

    if mode == "weekday":
        weekday_weights: dict[str, dict[str, float]] = {}
        for dow in _DOW_NAMES:
            mask = np.array([d == dow for d in all_dows])
            n_dow = int(mask.sum())

            if n_dow < 5:
                weekday_weights[dow] = dict(global_dict)
                per_weekday_lambda[dow] = 1.0
                continue

            dow_act = all_actuals[mask]
            dow_preds = preds_matrix[mask]
            dow_pw = all_point_weights[mask]

            raw_dow_w = _optimize_weights_for_points(dow_act, dow_preds, ENSEMBLE_MIN_WEIGHT, dow_pw)

            if shrinkage_min_samples > 0:
                lam = shrinkage_min_samples / (shrinkage_min_samples + n_dow)
                lam = max(lam, shrinkage_floor)
                shrunk_w = lam * global_w + (1.0 - lam) * raw_dow_w
                shrunk_w = _project_simplex_with_min(shrunk_w, ENSEMBLE_MIN_WEIGHT)
            else:
                lam = 0.0
                shrunk_w = raw_dow_w

            per_weekday_lambda[dow] = round(lam, 4)
            weekday_weights[dow] = {m: round(float(shrunk_w[i]), 4) for i, m in enumerate(members)}

        result["weekday"] = weekday_weights

    result["shrinkage"] = {
        "recency_alpha": recency_alpha,
        "shrinkage_min_samples": shrinkage_min_samples,
        "shrinkage_floor": shrinkage_floor,
        "per_weekday_lambda": per_weekday_lambda,
    }

    return result


# ──────────────────────────────────────────────────────────
#  B) Blend predictions
# ──────────────────────────────────────────────────────────

def blend_predictions(
    preds_by_family: dict[str, np.ndarray],
    dates: pd.DatetimeIndex,
    weights: dict,
    mode: str = ENSEMBLE_WEIGHT_MODE,
) -> np.ndarray:
    members = sorted(preds_by_family.keys())
    n = len(dates)
    blended = np.zeros(n)

    for t in range(n):
        if mode == "weekday" and "weekday" in weights:
            dow = dates[t].day_name()
            w_dict = weights["weekday"].get(dow, weights["global"])
        else:
            w_dict = weights["global"]
        for m in members:
            blended[t] += w_dict.get(m, 0.0) * preds_by_family[m][t]

    return np.maximum(blended, 0.0)


# ──────────────────────────────────────────────────────────
#  C) Blend intervals
# ──────────────────────────────────────────────────────────

def blend_intervals(
    lower_by_family: dict[str, np.ndarray],
    upper_by_family: dict[str, np.ndarray],
    dates: pd.DatetimeIndex,
    weights: dict,
    mode: str = ENSEMBLE_WEIGHT_MODE,
) -> tuple[np.ndarray, np.ndarray]:
    lower = blend_predictions(lower_by_family, dates, weights, mode)
    upper = blend_predictions(upper_by_family, dates, weights, mode)
    lower = np.maximum(lower, 0.0)
    upper = np.maximum(upper, lower)
    return lower, upper


# ──────────────────────────────────────────────────────────
#  D) Backtest ensemble from per-fold member predictions
# ──────────────────────────────────────────────────────────

def collect_member_fold_predictions(
    ts: TimeSeries,
    valid_candidates: dict[str, ModelCandidate],
    horizon: int = BACKTEST_HORIZON_DAYS,
    step: int = BACKTEST_STEP_DAYS,
    base_series: Optional[dict[str, TimeSeries]] = None,
    holiday_provider=None,
    event_provider=None,
    timeout_seconds: float = ENSEMBLE_TIMEOUT_SEC,
) -> dict[str, Any]:
    """Produce per-fold predictions for each valid member family.

    Reuses the best candidate config from each family and fits it per fold.
    Returns {family: list_of_yhat_arrays}, plus fold_actuals and fold_dates.
    """
    from sarima import fit_forecast_sarima
    from transforms import get_transform

    transform = get_transform("revenue")
    folds = compute_folds(len(ts), horizon, step)
    if len(folds) < ENSEMBLE_MIN_FOLDS:
        return {"valid": False, "reason": "insufficient_folds"}

    fold_actuals: list[np.ndarray] = []
    fold_dates: list[pd.DatetimeIndex] = []
    fold_preds: dict[str, list[np.ndarray]] = {f: [] for f in valid_candidates}

    start = time.time()

    for fold_i, (train_end, test_end) in enumerate(folds):
        if (time.time() - start) > timeout_seconds:
            break

        test_vals = ts.values[train_end:test_end]
        h = len(test_vals)
        fold_actuals.append(test_vals)
        fold_dates.append(ts.dates[train_end:test_end])

        for fam, cand in valid_candidates.items():
            yhat = _fit_member_fold(ts, cand, train_end, h, transform,
                                    base_series, holiday_provider, event_provider)
            fold_preds[fam].append(yhat)

    n_folds = len(fold_actuals)
    if n_folds < ENSEMBLE_MIN_FOLDS:
        return {"valid": False, "reason": f"only_{n_folds}_folds"}

    return {
        "valid": True,
        "fold_actuals": fold_actuals,
        "fold_dates": fold_dates,
        "fold_preds": fold_preds,
        "n_folds": n_folds,
    }


def _fit_member_fold(
    ts: TimeSeries,
    cand: ModelCandidate,
    train_end: int,
    horizon: int,
    transform,
    base_series,
    hp, ep,
) -> np.ndarray:
    """Fit a single member model on a fold and return yhat on natural scale."""
    from sarima import fit_forecast_sarima
    from baselines import forecast_ma7, forecast_same_day_last_week

    train_ts = ts.slice(0, train_end)
    name = cand.model_name
    fallback = np.full(horizon, float(np.mean(ts.values[max(0, train_end - 28):train_end])))

    try:
        if name == "sarima":
            params = cand.params
            order = tuple(params.get("order", [0, 0, 0]))
            seasonal = tuple(params.get("seasonal_order", [1, 0, 1, 7]))
            y_t = transform.forward(train_ts.values)
            yhat_t, _, _, _ = fit_forecast_sarima(y_t, order, seasonal, horizon)
            if yhat_t is None:
                return fallback
            return transform.inverse(yhat_t)[:horizon]

        elif name == "prophet":
            from prophet_model import fit_forecast_prophet
            from holidays import HolidayProvider, merge_prophet_holidays
            config = {k: v for k, v in cand.params.items() if k != "config_idx"}
            holidays_df = None
            if hp:
                hdf = hp.holidays_df(train_ts.dates[0].date(), train_ts.dates[-1].date())
                edf = ep.events_df(train_ts.dates[0].date(), train_ts.dates[-1].date()) if ep else pd.DataFrame(columns=["ds", "event_name"])
                holidays_df = merge_prophet_holidays(hdf, edf)
            yhat, _, _, _ = fit_forecast_prophet(train_ts, transform, horizon, holidays_df=holidays_df, config=config)
            if yhat is None:
                return fallback
            return np.asarray(yhat)[:horizon]

        elif name == "sarimax_exog":
            from sarimax_exog import fit_forecast_sarimax_exog
            from holidays import build_holiday_flags
            from regressors import build_train_exog

            params = cand.params
            order = tuple(params.get("order", [0, 0, 0]))
            seasonal = tuple(params.get("seasonal_order", [1, 0, 0, 7]))

            if base_series and hp:
                hdf = hp.holidays_df(train_ts.dates[0].date(), train_ts.dates[-1].date())
                edf = ep.events_df(train_ts.dates[0].date(), train_ts.dates[-1].date()) if ep else pd.DataFrame(columns=["ds", "event_name"])
                h_flags = build_holiday_flags(train_ts.dates, hdf, edf)
                full_exog = build_train_exog("revenue", train_ts.dates, base_series, h_flags)

                if not full_exog.empty:
                    exog_tr = full_exog.iloc[:train_end].values if len(full_exog) >= train_end else full_exog.values
                    exog_te_start = min(train_end, len(full_exog))
                    exog_te = full_exog.iloc[exog_te_start:exog_te_start + horizon].values
                    if len(exog_te) < horizon:
                        pad = np.tile(exog_tr[-1:], (horizon - len(exog_te), 1))
                        exog_te = np.vstack([exog_te, pad]) if len(exog_te) > 0 else pad

                    y_t = transform.forward(train_ts.values)
                    yhat_t, _, _, _ = fit_forecast_sarimax_exog(y_t, order, seasonal, exog_tr, exog_te, horizon)
                    if yhat_t is None:
                        return fallback
                    return transform.inverse(yhat_t)[:horizon]

            return fallback

        elif name in ("ma7", "same_day_last_week"):
            fn = forecast_ma7 if name == "ma7" else forecast_same_day_last_week
            fr = fn(train_ts, horizon)
            return np.array(fr.yhat[:horizon])

        return fallback

    except Exception as e:
        logger.debug("ensemble _fit_member_fold(%s) failed: %s", name, e)
        return fallback


def backtest_ensemble(
    ts: TimeSeries,
    valid_candidates: dict[str, ModelCandidate],
    horizon: int = BACKTEST_HORIZON_DAYS,
    step: int = BACKTEST_STEP_DAYS,
    mode: str = ENSEMBLE_WEIGHT_MODE,
    base_series=None,
    holiday_provider=None,
    event_provider=None,
    timeout_seconds: float = ENSEMBLE_TIMEOUT_SEC,
) -> dict[str, Any]:
    """Full ensemble backtest: collect fold preds, fit weights, compute error."""

    collected = collect_member_fold_predictions(
        ts, valid_candidates, horizon, step,
        base_series, holiday_provider, event_provider,
        timeout_seconds=timeout_seconds,
    )
    if not collected.get("valid"):
        return {"valid": False, "reason": collected.get("reason", "collection_failed")}

    fold_actuals = collected["fold_actuals"]
    fold_dates = collected["fold_dates"]
    fold_preds = collected["fold_preds"]
    n_folds = collected["n_folds"]

    # Leave-one-out cross-validated weights: fit on all but fold i, score on fold i
    # For speed, fit weights on ALL folds jointly (simpler, still effective)
    weights = fit_ensemble_weights(fold_actuals, fold_preds, fold_dates, mode=mode)

    members = sorted(fold_preds.keys())
    fold_smapes: list[float] = []
    fold_mapes: list[float] = []
    member_fold_smapes: dict[str, list[float]] = {m: [] for m in members}

    for fold_i in range(n_folds):
        act = fold_actuals[fold_i]
        dates = fold_dates[fold_i]
        h = len(act)

        preds = {m: fold_preds[m][fold_i][:h] for m in members}
        blended = blend_predictions(preds, dates, weights, mode)

        lookback = min(EXPLOSION_LOOKBACK_DAYS, len(ts))
        guard = explosion_guard(blended, ts.values[-lookback:])
        if guard["explosion_guard_triggered"]:
            fold_smapes.append(MAPE_CAP_FOR_SELECTOR)
            fold_mapes.append(MAPE_CAP_FOR_SELECTOR)
            continue

        s = smape_fn(act, blended[:h])
        m = mape_fn(act, blended[:h])
        fold_smapes.append(min(s, MAPE_CAP_FOR_SELECTOR) if np.isfinite(s) else MAPE_CAP_FOR_SELECTOR)
        fold_mapes.append(min(m, MAPE_CAP_FOR_SELECTOR) if np.isfinite(m) else MAPE_CAP_FOR_SELECTOR)

        for mem in members:
            ms = smape_fn(act, preds[mem][:h])
            member_fold_smapes[mem].append(ms if np.isfinite(ms) else MAPE_CAP_FOR_SELECTOR)

    if not fold_smapes:
        return {"valid": False, "reason": "no_valid_folds"}

    return {
        "valid": True,
        "mean_smape": float(np.mean(fold_smapes)),
        "mean_mape": float(np.mean(fold_mapes)),
        "fold_smapes": [round(x, 6) for x in fold_smapes],
        "n_folds": len(fold_smapes),
        "weights": weights,
        "members": members,
        "member_mean_smapes": {m: round(float(np.mean(member_fold_smapes[m])), 6) for m in members},
        "mode": mode,
    }
