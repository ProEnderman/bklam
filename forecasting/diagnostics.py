"""Residual diagnostics and forecast validity checks."""

from __future__ import annotations

import logging
import warnings
from typing import Any

import numpy as np

from config import (
    MAX_FORECAST_GROWTH_FACTOR,
    EXPLOSION_LOOKBACK_DAYS,
    EXPLOSION_P90_FACTOR,
    EXPLOSION_MAX_FACTOR,
)

logger = logging.getLogger(__name__)

_explosion_log: list[dict[str, Any]] = []


def get_explosion_log() -> list[dict[str, Any]]:
    return list(_explosion_log)


def reset_explosion_log() -> None:
    _explosion_log.clear()


def ljung_box_test(residuals: np.ndarray, lags: int = 10) -> dict[str, Any]:
    """Ljung-Box test for residual autocorrelation."""
    try:
        from statsmodels.stats.diagnostic import acorr_ljungbox

        res = acorr_ljungbox(residuals, lags=lags, return_df=True)
        p_values = res["lb_pvalue"].values
        return {
            "ljung_box_p_min": float(np.nanmin(p_values)),
            "ljung_box_p_values": [round(float(p), 4) for p in p_values[:5]],
            "autocorrelation_detected": bool(np.nanmin(p_values) < 0.01),
        }
    except Exception as e:
        return {
            "ljung_box_p_min": None,
            "ljung_box_error": str(e),
            "autocorrelation_detected": False,
        }


def residual_diagnostics(residuals: np.ndarray) -> dict[str, Any]:
    """Full residual diagnostic suite."""
    residuals = np.asarray(residuals, dtype=np.float64)
    mask = np.isfinite(residuals)
    clean = residuals[mask]

    result: dict[str, Any] = {"n_residuals": len(clean), "warnings": []}

    if len(clean) < 5:
        result["warnings"].append("too_few_residuals")
        return result

    result["mean"] = round(float(np.mean(clean)), 4)
    result["std"] = round(float(np.std(clean)), 4)
    result["has_nan"] = bool(np.any(~mask))
    result.update(ljung_box_test(clean))

    return result


def check_convergence(fit_result: Any) -> dict[str, Any]:
    """Check statsmodels SARIMAX convergence."""
    diag: dict[str, Any] = {"converged": True, "warnings": []}
    try:
        if hasattr(fit_result, "mle_retvals"):
            diag["converged"] = bool(fit_result.mle_retvals.get("converged", True))
        if hasattr(fit_result, "aic"):
            aic = float(fit_result.aic)
            diag["aic"] = round(aic, 2) if np.isfinite(aic) else None
        params = fit_result.params if hasattr(fit_result, "params") else []
        if np.any(~np.isfinite(params)):
            diag["converged"] = False
            diag["warnings"].append("non_finite_params")
    except Exception as e:
        diag["converged"] = False
        diag["warnings"].append(f"convergence_check_error: {e}")
    return diag


def explosion_guard(
    yhat: np.ndarray,
    recent_values: np.ndarray,
    factor: float = MAX_FORECAST_GROWTH_FACTOR,
) -> dict[str, Any]:
    """Adaptive explosion guard.

    Triggers only when forecast exceeds BOTH:
      - EXPLOSION_MAX_FACTOR * max(last N days)
      - EXPLOSION_P90_FACTOR * p90(last N days)

    This preserves natural seasonal peaks while catching true explosions.
    """
    if len(recent_values) == 0 or len(yhat) == 0:
        return {"explosion_guard_triggered": False, "reason": "empty_input"}

    recent = np.abs(recent_values)
    yhat_max = float(np.max(np.abs(yhat)))

    recent_max = float(np.max(recent))
    recent_p90 = float(np.percentile(recent, 90)) if len(recent) >= 5 else recent_max
    recent_med = float(np.median(recent))

    # Adaptive thresholds
    thresh_max = max(recent_max * EXPLOSION_MAX_FACTOR, 1.0)
    thresh_p90 = max(recent_p90 * EXPLOSION_P90_FACTOR, 1.0)

    exceeds_max = yhat_max > thresh_max
    exceeds_p90 = yhat_max > thresh_p90

    # Only trigger if BOTH conditions met (strict = prevents false rejections for peaky data)
    triggered = exceeds_max and exceeds_p90

    result = {
        "explosion_guard_triggered": triggered,
        "forecast_max": round(yhat_max, 2),
        "recent_max": round(recent_max, 2),
        "recent_p90": round(recent_p90, 2),
        "recent_median": round(recent_med, 2),
        "thresh_max": round(thresh_max, 2),
        "thresh_p90": round(thresh_p90, 2),
        "exceeds_max": exceeds_max,
        "exceeds_p90": exceeds_p90,
    }

    _explosion_log.append(result)

    return result
