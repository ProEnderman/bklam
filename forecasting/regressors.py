"""Regressor construction for SARIMAX(exog) and Prophet models."""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from types_ import TimeSeries
from config import REGRESSOR_FUTURE_STRATEGY_DEFAULT, SEASONAL_PERIOD

logger = logging.getLogger(__name__)

_CORE_REGRESSORS = ["bookings", "utilization", "cancel_rate"]


def available_regressors(base_series: dict[str, TimeSeries]) -> list[str]:
    return [k for k in _CORE_REGRESSORS if k in base_series and len(base_series[k]) > 0]


def build_train_exog(
    metric: str,
    dates: pd.DatetimeIndex,
    base_series: dict[str, TimeSeries],
    holiday_flags: pd.DataFrame,
) -> pd.DataFrame:
    """Align regressors to given dates, return float64 DataFrame."""
    exog = pd.DataFrame(index=dates)

    for name in _CORE_REGRESSORS:
        if name == metric or name not in base_series:
            continue
        ts = base_series[name]
        s = pd.Series(ts.values, index=ts.dates, dtype=np.float64)
        s = s.reindex(dates).ffill(limit=2).bfill(limit=2).fillna(0.0)
        exog[name] = s.values

    if holiday_flags is not None and not holiday_flags.empty:
        for col in ["is_holiday", "is_event"]:
            if col in holiday_flags.columns:
                aligned = holiday_flags[col].reindex(dates).fillna(0.0)
                exog[col] = aligned.values

    return exog.astype(np.float64)


def build_future_exog(
    metric: str,
    future_dates: pd.DatetimeIndex,
    history_exog: pd.DataFrame,
    holiday_flags_future: pd.DataFrame,
    strategy: str = REGRESSOR_FUTURE_STRATEGY_DEFAULT,
) -> pd.DataFrame:
    future = pd.DataFrame(index=future_dates)

    for col in history_exog.columns:
        if col in ("is_holiday", "is_event"):
            continue
        vals = history_exog[col].values
        if strategy == "seasonal_last_week" and len(vals) >= SEASONAL_PERIOD:
            pattern = vals[-SEASONAL_PERIOD:]
            repeats = (len(future_dates) // SEASONAL_PERIOD) + 1
            tiled = np.tile(pattern, repeats)[: len(future_dates)]
            future[col] = tiled
        else:
            last = float(vals[-1]) if len(vals) > 0 else 0.0
            future[col] = last

    if holiday_flags_future is not None and not holiday_flags_future.empty:
        for col in ["is_holiday", "is_event"]:
            if col in holiday_flags_future.columns:
                aligned = holiday_flags_future[col].reindex(future_dates).fillna(0.0)
                future[col] = aligned.values
            elif col not in future.columns:
                future[col] = 0.0
    else:
        for col in ["is_holiday", "is_event"]:
            if col not in future.columns and col in history_exog.columns:
                future[col] = 0.0

    return future.astype(np.float64)


def add_prophet_regressors(model, exog_cols: list[str]) -> None:
    for col in exog_cols:
        try:
            model.add_regressor(col)
        except Exception:
            pass
