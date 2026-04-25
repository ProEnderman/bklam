"""SARIMAX candidate with exogenous regressors."""

from __future__ import annotations

import logging
import warnings
from typing import Any, Optional, Tuple

import numpy as np
import pandas as pd

from config import SEASONAL_PERIOD, SARIMAX_EXOG_MAX_CANDIDATES
from diagnostics import check_convergence, residual_diagnostics

logger = logging.getLogger(__name__)


def _build_exog_search_space() -> list[Tuple[Tuple, Tuple]]:
    """Pruned grid for SARIMAX with exog. p+q+P+Q <= 5."""
    candidates = []
    for p in range(3):
        for d in range(2):
            for q in range(3):
                for P in range(2):
                    for D in range(2):
                        for Q in range(2):
                            if p + q + P + Q > 5:
                                continue
                            candidates.append(
                                ((p, d, q), (P, D, Q, SEASONAL_PERIOD))
                            )
    return candidates


EXOG_SEARCH_SPACE = _build_exog_search_space()


def fit_forecast_sarimax_exog(
    y: np.ndarray,
    order: Tuple[int, int, int],
    seasonal_order: Tuple[int, int, int, int],
    exog_train: np.ndarray,
    exog_future: np.ndarray,
    horizon: int,
) -> Tuple[Optional[np.ndarray], Optional[np.ndarray], Optional[np.ndarray], dict[str, Any]]:
    """
    Fit SARIMAX with exog and forecast.
    Input y is on transformed scale.
    Returns (yhat_t, lower_t, upper_t, diagnostics).
    """
    from statsmodels.tsa.statespace.sarimax import SARIMAX

    diag: dict[str, Any] = {
        "order": list(order),
        "seasonal_order": list(seasonal_order),
        "n_exog_cols": exog_train.shape[1] if exog_train.ndim > 1 else 1,
        "exog_train_shape": list(exog_train.shape),
        "exog_future_shape": list(exog_future.shape),
    }

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            model = SARIMAX(
                y,
                exog=exog_train,
                order=order,
                seasonal_order=seasonal_order,
                enforce_stationarity=False,
                enforce_invertibility=False,
            )
            result = model.fit(disp=False, maxiter=200)
    except Exception as e:
        diag["converged"] = False
        diag["error"] = str(e)
        return None, None, None, diag

    conv = check_convergence(result)
    diag.update(conv)
    if not conv["converged"]:
        return None, None, None, diag

    try:
        fc = result.get_forecast(steps=horizon, exog=exog_future)
        yhat = np.asarray(fc.predicted_mean, dtype=np.float64).ravel()
        ci = np.asarray(fc.conf_int(alpha=0.2), dtype=np.float64)
        lower = ci[:, 0]
        upper = ci[:, 1]
    except Exception as e:
        diag["error"] = f"forecast_error: {e}"
        return None, None, None, diag

    if np.any(~np.isfinite(yhat)):
        diag["error"] = "non_finite_forecast"
        return None, None, None, diag

    try:
        resid = np.asarray(result.resid, dtype=np.float64)
        if len(resid) > 10:
            diag["residuals"] = residual_diagnostics(resid)
    except Exception:
        pass

    return yhat, lower, upper, diag
