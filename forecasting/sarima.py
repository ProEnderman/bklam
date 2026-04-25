"""Robust SARIMAX training and forecasting with pruned parameter search."""

from __future__ import annotations

import warnings
from typing import Any, Optional, Tuple

import numpy as np

from config import SEASONAL_PERIOD
from diagnostics import check_convergence, residual_diagnostics


def _build_search_space() -> list[Tuple[Tuple, Tuple]]:
    """Pruned SARIMA parameter grid. Total params p+q+P+Q <= 6."""
    candidates = []
    for p in range(3):
        for d in range(2):
            for q in range(3):
                for P in range(3):
                    for D in range(2):
                        for Q in range(3):
                            if p + q + P + Q > 6:
                                continue
                            order = (p, d, q)
                            seasonal = (P, D, Q, SEASONAL_PERIOD)
                            candidates.append((order, seasonal))
    return candidates


SEARCH_SPACE = _build_search_space()


def fit_sarima(
    y: np.ndarray,
    order: Tuple[int, int, int],
    seasonal_order: Tuple[int, int, int, int],
    maxiter: int = 200,
) -> Optional[Any]:
    """Fit SARIMAX model, return fit result or None on failure."""
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = SARIMAX(
                y,
                order=order,
                seasonal_order=seasonal_order,
                enforce_stationarity=False,
                enforce_invertibility=False,
            )
            result = model.fit(disp=False, maxiter=maxiter)
        return result
    except Exception:
        return None


def forecast_sarima(
    fit_result: Any,
    horizon: int,
    alpha: float = 0.2,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Produce point forecast + (1-alpha) interval from fitted SARIMAX."""
    fc = fit_result.get_forecast(steps=horizon)
    yhat = np.asarray(fc.predicted_mean, dtype=np.float64).ravel()
    ci = fc.conf_int(alpha=alpha)
    ci_arr = np.asarray(ci, dtype=np.float64)
    lower = ci_arr[:, 0]
    upper = ci_arr[:, 1]
    return yhat, lower, upper


def fit_forecast_sarima(
    y: np.ndarray,
    order: Tuple[int, int, int],
    seasonal_order: Tuple[int, int, int, int],
    horizon: int,
) -> Tuple[Optional[np.ndarray], Optional[np.ndarray], Optional[np.ndarray], dict[str, Any]]:
    """
    Fit SARIMA and forecast. Returns (yhat, lower, upper, diagnostics).
    Returns (None, None, None, diagnostics) on failure.
    """
    diag: dict[str, Any] = {"order": list(order), "seasonal_order": list(seasonal_order)}

    result = fit_sarima(y, order, seasonal_order)
    if result is None:
        diag["converged"] = False
        diag["warnings"] = ["fit_failed"]
        return None, None, None, diag

    conv = check_convergence(result)
    diag.update(conv)

    if not conv["converged"]:
        return None, None, None, diag

    try:
        yhat, lower, upper = forecast_sarima(result, horizon)
    except Exception as e:
        diag["warnings"] = diag.get("warnings", []) + [f"forecast_error: {e}"]
        return None, None, None, diag

    if np.any(~np.isfinite(yhat)):
        diag["warnings"] = diag.get("warnings", []) + ["non_finite_forecast"]
        return None, None, None, diag

    # Residual diagnostics
    try:
        resid = result.resid
        if resid is not None and len(resid) > 10:
            diag["residuals"] = residual_diagnostics(resid)
    except Exception:
        pass

    return yhat, lower, upper, diag
