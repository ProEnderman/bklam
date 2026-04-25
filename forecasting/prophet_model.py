"""Prophet candidate with holidays, regressors, and robust config."""

from __future__ import annotations

import logging
import warnings
from typing import Any, Optional, Tuple

import numpy as np
import pandas as pd

from types_ import TimeSeries
from transforms import Transform
from config import (
    PROPHET_INTERVAL_WIDTH,
    PROPHET_SEASONALITY_MODE,
    PROPHET_CHANGEPOINT_PRIOR_SCALE,
    PROPHET_SEASONALITY_PRIOR_SCALE,
    PROPHET_OUTLIER_CAP_Z,
)

logger = logging.getLogger(__name__)


def _winsorize(y: np.ndarray, z_cap: float) -> np.ndarray:
    mu, sigma = np.mean(y), np.std(y)
    if sigma < 1e-12:
        return y.copy()
    lo = mu - z_cap * sigma
    hi = mu + z_cap * sigma
    return np.clip(y, lo, hi)


def fit_forecast_prophet(
    ts: TimeSeries,
    transform: Transform,
    horizon: int,
    holidays_df: Optional[pd.DataFrame] = None,
    exog_train: Optional[pd.DataFrame] = None,
    exog_future: Optional[pd.DataFrame] = None,
    config: Optional[dict] = None,
) -> Tuple[Optional[np.ndarray], Optional[np.ndarray], Optional[np.ndarray], dict[str, Any]]:
    """
    Fit Prophet on transformed scale, forecast, invert.
    Returns (yhat, lower, upper, diagnostics) on original scale,
    or (None, None, None, diagnostics) on failure.
    """
    diag: dict[str, Any] = {"model": "prophet"}
    cfg = config or {}

    try:
        from prophet import Prophet
    except ImportError:
        diag["error"] = "prophet not installed"
        return None, None, None, diag

    try:
        y_t = transform.forward(ts.values)

        if cfg.get("winsorize", True):
            y_t = _winsorize(y_t, cfg.get("outlier_cap_z", PROPHET_OUTLIER_CAP_Z))

        df = pd.DataFrame({
            "ds": ts.dates,
            "y": y_t,
        })

        cps = cfg.get("changepoint_prior_scale", PROPHET_CHANGEPOINT_PRIOR_SCALE)
        smode = cfg.get("seasonality_mode", PROPHET_SEASONALITY_MODE)

        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            m = Prophet(
                weekly_seasonality=True,
                daily_seasonality=False,
                yearly_seasonality=False,
                changepoint_prior_scale=cps,
                seasonality_prior_scale=cfg.get("seasonality_prior_scale", PROPHET_SEASONALITY_PRIOR_SCALE),
                seasonality_mode=smode,
                interval_width=PROPHET_INTERVAL_WIDTH,
            )

            if holidays_df is not None and not holidays_df.empty:
                m.holidays = holidays_df

            exog_cols = []
            if exog_train is not None and not exog_train.empty:
                for col in exog_train.columns:
                    try:
                        m.add_regressor(col)
                        exog_cols.append(col)
                    except Exception:
                        pass
                for col in exog_cols:
                    df[col] = exog_train[col].values[:len(df)]

            m.fit(df)

        future = m.make_future_dataframe(periods=horizon)
        future = future.tail(horizon).reset_index(drop=True)

        if exog_future is not None and exog_cols:
            for col in exog_cols:
                if col in exog_future.columns:
                    future[col] = exog_future[col].values[:horizon]
                else:
                    future[col] = 0.0

        fc = m.predict(future)
        yhat_t = fc["yhat"].values.astype(np.float64)
        lower_t = fc["yhat_lower"].values.astype(np.float64)
        upper_t = fc["yhat_upper"].values.astype(np.float64)

        if np.any(~np.isfinite(yhat_t)):
            diag["error"] = "non_finite_forecast"
            return None, None, None, diag

        yhat = transform.inverse(yhat_t)
        lo, hi = transform.inverse_interval(lower_t, upper_t)

        diag["changepoint_prior_scale"] = cps
        diag["seasonality_mode"] = smode
        diag["n_changepoints"] = len(m.changepoints) if hasattr(m, "changepoints") else 0
        diag["exog_cols"] = exog_cols
        diag["exog_train_shape"] = list(exog_train.shape) if exog_train is not None and hasattr(exog_train, 'shape') else None
        diag["exog_future_shape"] = list(exog_future.shape) if exog_future is not None and hasattr(exog_future, 'shape') else None

        return yhat, lo, hi, diag

    except Exception as e:
        diag["error"] = f"fit_failed: {e}"
        return None, None, None, diag
