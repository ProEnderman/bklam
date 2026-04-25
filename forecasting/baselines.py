"""Baseline forecasters: MovingAverage7 and SameDayLastWeek."""

from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd
from scipy import stats as sp_stats

from types_ import TimeSeries, ForecastResult
from config import SEASONAL_PERIOD


def _empirical_interval(values: np.ndarray, alpha: float = 0.2) -> float:
    """80% normal interval half-width from empirical std."""
    if len(values) < 2:
        return float(np.mean(np.abs(values))) * 0.5 if len(values) else 0.0
    z = sp_stats.norm.ppf(1 - alpha / 2)
    return float(z * np.std(values, ddof=1))


def forecast_ma7(ts: TimeSeries, horizon: int) -> ForecastResult:
    """7-day moving average baseline."""
    vals = ts.values
    tail_7 = vals[-min(7, len(vals)):]
    avg = float(np.mean(tail_7))

    tail_28 = vals[-min(28, len(vals)):]
    hw = _empirical_interval(tail_28)

    last_date = ts.dates[-1]
    dates = [(last_date + pd.Timedelta(days=i + 1)).strftime("%Y-%m-%d") for i in range(horizon)]

    return ForecastResult(
        dates=dates,
        yhat=[round(avg, 4)] * horizon,
        yhat_lower=[round(avg - hw, 4)] * horizon,
        yhat_upper=[round(avg + hw, 4)] * horizon,
        model_name="ma7",
        params={"window": 7},
        transform_name="identity",
        train_end=last_date.strftime("%Y-%m-%d"),
        mape_rolling=None,
    )


def forecast_same_day_last_week(ts: TimeSeries, horizon: int) -> ForecastResult:
    """Same day-of-week from last week baseline."""
    vals = ts.values
    dates_idx = ts.dates
    last_date = dates_idx[-1]

    yhat = []
    yhat_lower = []
    yhat_upper = []
    out_dates = []

    for i in range(1, horizon + 1):
        target = last_date + pd.Timedelta(days=i)
        out_dates.append(target.strftime("%Y-%m-%d"))

        # Collect same-weekday values from history (up to 8 weeks back)
        same_dow_vals = []
        for w in range(1, 9):
            idx = len(vals) - (SEASONAL_PERIOD * w) + i
            if 0 <= idx < len(vals):
                same_dow_vals.append(vals[idx])

        if same_dow_vals:
            point = float(np.mean(same_dow_vals))
            hw = _empirical_interval(np.array(same_dow_vals))
        else:
            point = float(np.mean(vals[-7:])) if len(vals) >= 7 else float(np.mean(vals))
            hw = _empirical_interval(vals[-28:]) if len(vals) >= 28 else 0.0

        yhat.append(round(point, 4))
        yhat_lower.append(round(point - hw, 4))
        yhat_upper.append(round(point + hw, 4))

    return ForecastResult(
        dates=out_dates,
        yhat=yhat,
        yhat_lower=yhat_lower,
        yhat_upper=yhat_upper,
        model_name="same_day_last_week",
        params={"lookback_weeks": 8},
        transform_name="identity",
        train_end=last_date.strftime("%Y-%m-%d"),
        mape_rolling=None,
    )


def forecast_baselines(
    ts: TimeSeries, horizon: int
) -> dict[str, ForecastResult]:
    return {
        "ma7": forecast_ma7(ts, horizon),
        "same_day_last_week": forecast_same_day_last_week(ts, horizon),
    }
