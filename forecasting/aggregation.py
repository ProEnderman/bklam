"""Calendar-month aggregation of daily forecasts."""

from __future__ import annotations

import calendar
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal, Optional

import numpy as np
import pandas as pd

from types_ import ForecastResult


@dataclass
class MonthlyRollupResult:
    metric: str
    year: int
    month: int
    period_start: str
    period_end: str
    status: str  # "full", "partial", "no_data"
    covered_days: int
    total_days: int
    coverage_ratio: float
    predicted_total: float
    lower_total: Optional[float]
    upper_total: Optional[float]
    model_family_used: str
    last_updated_timestamp: str
    source_forecast_snapshot_id: Optional[str] = None
    notes: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "metric": self.metric,
            "year": self.year,
            "month": self.month,
            "period_start": self.period_start,
            "period_end": self.period_end,
            "status": self.status,
            "covered_days": self.covered_days,
            "total_days": self.total_days,
            "coverage_ratio": round(self.coverage_ratio, 4),
            "predicted_total": round(self.predicted_total, 2),
            "lower_total": round(self.lower_total, 2) if self.lower_total is not None else None,
            "upper_total": round(self.upper_total, 2) if self.upper_total is not None else None,
            "model_family_used": self.model_family_used,
            "last_updated_timestamp": self.last_updated_timestamp,
            "source_forecast_snapshot_id": self.source_forecast_snapshot_id,
            "notes": self.notes,
        }


_SUM_METRICS = {"revenue", "bookings"}
_MEAN_METRICS = {"utilization", "cancel_rate"}


def month_date_range(year: int, month: int) -> tuple[pd.Timestamp, pd.Timestamp]:
    """Return (first_day, last_day) of the calendar month as Timestamps."""
    first = pd.Timestamp(year=year, month=month, day=1)
    last_day = calendar.monthrange(year, month)[1]
    last = pd.Timestamp(year=year, month=month, day=last_day)
    return first, last


def slice_daily_to_month(
    dates: pd.DatetimeIndex,
    yhat: np.ndarray,
    lower: Optional[np.ndarray],
    upper: Optional[np.ndarray],
    year: int,
    month: int,
) -> dict[str, Any]:
    """Mask daily arrays to a calendar month, returning sliced arrays + dates."""
    first, last = month_date_range(year, month)
    mask = (dates >= first) & (dates <= last)

    return {
        "dates": dates[mask],
        "yhat": yhat[mask],
        "lower": lower[mask] if lower is not None else None,
        "upper": upper[mask] if upper is not None else None,
        "covered_days": int(mask.sum()),
        "total_days": calendar.monthrange(year, month)[1],
    }


def aggregate_month_sum(
    yhat: np.ndarray,
    lower: Optional[np.ndarray],
    upper: Optional[np.ndarray],
) -> tuple[float, Optional[float], Optional[float]]:
    """Sum daily forecasts; shrink confidence interval for aggregation.

    Daily intervals assume independent errors, so naively summing lower/upper
    bounds overestimates uncertainty.  We recompute the monthly band by summing
    the per-day half-widths in quadrature (sqrt of sum of squares), which is the
    correct formula when daily forecast errors are approximately independent.
    """
    if len(yhat) == 0:
        return 0.0, None, None

    total = float(np.sum(yhat))

    def _shrunk_band(bounds: np.ndarray) -> float:
        residuals = bounds - yhat
        aggregated_residual = float(np.sign(np.mean(residuals)) *
                                    np.sqrt(np.sum(residuals ** 2)))
        return total + aggregated_residual

    lo = _shrunk_band(lower) if lower is not None else None
    hi = _shrunk_band(upper) if upper is not None else None
    return total, lo, hi


def aggregate_month_mean(
    yhat: np.ndarray,
    lower: Optional[np.ndarray],
    upper: Optional[np.ndarray],
) -> tuple[float, Optional[float], Optional[float]]:
    if len(yhat) == 0:
        return 0.0, None, None
    return (
        float(np.mean(yhat)),
        float(np.mean(lower)) if lower is not None else None,
        float(np.mean(upper)) if upper is not None else None,
    )


def aggregate_avg_check_weighted(
    avg_check_yhat: np.ndarray,
    avg_check_lower: Optional[np.ndarray],
    avg_check_upper: Optional[np.ndarray],
    bookings_yhat: Optional[np.ndarray],
) -> tuple[float, Optional[float], Optional[float]]:
    """Weighted mean of avg_check by bookings; falls back to simple mean."""
    if len(avg_check_yhat) == 0:
        return 0.0, None, None

    if bookings_yhat is not None and len(bookings_yhat) == len(avg_check_yhat):
        w = np.maximum(bookings_yhat, 0.0)
        total_w = w.sum()
        if total_w > 0:
            pred = float(np.sum(w * avg_check_yhat) / total_w)
            lo = float(np.sum(w * avg_check_lower) / total_w) if avg_check_lower is not None else None
            hi = float(np.sum(w * avg_check_upper) / total_w) if avg_check_upper is not None else None
            return pred, lo, hi

    return aggregate_month_mean(avg_check_yhat, avg_check_lower, avg_check_upper)


def build_full_month_snapshot(
    metric: str,
    year: int,
    month: int,
    daily_forecast: ForecastResult,
    daily_actuals: dict[str, float],
    daily_forecast_bookings: Optional[ForecastResult],
    now_ts: str,
) -> MonthlyRollupResult:
    """Build a 100%-coverage snapshot by filling actual data for days missing from forecast."""
    first, last = month_date_range(year, month)
    total_days = calendar.monthrange(year, month)[1]
    all_days = pd.date_range(first, last, freq="D")

    fc_dates = pd.DatetimeIndex(pd.to_datetime(daily_forecast.dates))
    fc_yhat = np.array(daily_forecast.yhat, dtype=np.float64)
    fc_lower = np.array(daily_forecast.yhat_lower, dtype=np.float64) if daily_forecast.yhat_lower else None
    fc_upper = np.array(daily_forecast.yhat_upper, dtype=np.float64) if daily_forecast.yhat_upper else None

    fc_lookup: dict[str, int] = {}
    for i, d in enumerate(fc_dates):
        key = d.strftime("%Y-%m-%d")
        fc_lookup[key] = i

    yhat_full = np.zeros(total_days)
    lower_full = np.zeros(total_days)
    upper_full = np.zeros(total_days)
    actual_days = 0
    forecast_days = 0
    day_sources: list[str] = []

    for idx, day in enumerate(all_days):
        key = day.strftime("%Y-%m-%d")
        if key in daily_actuals:
            val = daily_actuals[key]
            yhat_full[idx] = val
            lower_full[idx] = val
            upper_full[idx] = val
            actual_days += 1
            day_sources.append("actual")
        elif key in fc_lookup:
            fi = fc_lookup[key]
            yhat_full[idx] = fc_yhat[fi]
            lower_full[idx] = fc_lower[fi] if fc_lower is not None else fc_yhat[fi]
            upper_full[idx] = fc_upper[fi] if fc_upper is not None else fc_yhat[fi]
            forecast_days += 1
            day_sources.append("forecast")
        else:
            day_sources.append("missing")

    # Fill gaps: for missing days, use nearest known value (prefer forecast neighbour)
    filled = 0
    for idx in range(total_days):
        if day_sources[idx] == "missing":
            fill_val = None
            # Look forward for nearest forecast
            for j in range(idx + 1, total_days):
                if day_sources[j] in ("forecast", "actual"):
                    fill_val = (yhat_full[j], lower_full[j], upper_full[j])
                    break
            # If no forward match, look backward
            if fill_val is None:
                for j in range(idx - 1, -1, -1):
                    if day_sources[j] in ("forecast", "actual"):
                        fill_val = (yhat_full[j], lower_full[j], upper_full[j])
                        break
            if fill_val is not None:
                yhat_full[idx], lower_full[idx], upper_full[idx] = fill_val
                day_sources[idx] = "filled"
                filled += 1

    covered = actual_days + forecast_days + filled

    if metric in _MEAN_METRICS:
        if covered > 0:
            mask = np.array([s != "missing" for s in day_sources])
            pred = float(np.mean(yhat_full[mask]))
            lo = float(np.mean(lower_full[mask]))
            hi = float(np.mean(upper_full[mask]))
        else:
            pred, lo, hi = 0.0, 0.0, 0.0
    else:
        pred = float(np.sum(yhat_full))
        fc_mask = np.array([s == "forecast" for s in day_sources])
        fc_residuals_lo = lower_full[fc_mask] - yhat_full[fc_mask] if fc_lower is not None else np.zeros(0)
        fc_residuals_hi = upper_full[fc_mask] - yhat_full[fc_mask] if fc_upper is not None else np.zeros(0)
        lo = pred + float(np.sign(np.mean(fc_residuals_lo)) * np.sqrt(np.sum(fc_residuals_lo ** 2))) if len(fc_residuals_lo) > 0 else pred
        hi = pred + float(np.sign(np.mean(fc_residuals_hi)) * np.sqrt(np.sum(fc_residuals_hi ** 2))) if len(fc_residuals_hi) > 0 else pred

    status = "full" if covered == total_days else ("partial" if covered > 0 else "no_data")
    notes: dict[str, Any] = {
        "aggregation": "calendar_month",
        "value_type": "mean" if metric in _MEAN_METRICS else "sum",
        "actual_days": actual_days,
        "forecast_days": forecast_days + filled,
        "missing_days": total_days - covered,
    }

    return MonthlyRollupResult(
        metric=metric, year=year, month=month,
        period_start=first.strftime("%Y-%m-%d"),
        period_end=last.strftime("%Y-%m-%d"),
        status=status, covered_days=covered, total_days=total_days,
        coverage_ratio=round(covered / total_days, 4) if total_days > 0 else 0.0,
        predicted_total=pred, lower_total=lo, upper_total=hi,
        model_family_used=daily_forecast.model_family or daily_forecast.model_name,
        last_updated_timestamp=now_ts, notes=notes,
    )


def build_monthly_rollup(
    metric: str,
    year: int,
    month: int,
    daily_forecast: ForecastResult,
    daily_forecast_bookings: Optional[ForecastResult],
    now_ts: str,
) -> MonthlyRollupResult:
    """Build a MonthlyRollupResult from a daily ForecastResult."""
    dates = pd.DatetimeIndex(pd.to_datetime(daily_forecast.dates))
    yhat = np.array(daily_forecast.yhat, dtype=np.float64)
    lower = np.array(daily_forecast.yhat_lower, dtype=np.float64) if daily_forecast.yhat_lower else None
    upper = np.array(daily_forecast.yhat_upper, dtype=np.float64) if daily_forecast.yhat_upper else None

    sliced = slice_daily_to_month(dates, yhat, lower, upper, year, month)
    covered = sliced["covered_days"]
    total = sliced["total_days"]

    if covered == 0:
        first, last = month_date_range(year, month)
        return MonthlyRollupResult(
            metric=metric, year=year, month=month,
            period_start=first.strftime("%Y-%m-%d"),
            period_end=last.strftime("%Y-%m-%d"),
            status="no_data", covered_days=0, total_days=total,
            coverage_ratio=0.0, predicted_total=0.0,
            lower_total=None, upper_total=None,
            model_family_used=daily_forecast.model_family or daily_forecast.model_name,
            last_updated_timestamp=now_ts,
            notes={"aggregation": "calendar_month"},
        )

    s_yhat = sliced["yhat"]
    s_lower = sliced["lower"]
    s_upper = sliced["upper"]

    if metric == "avg_check":
        bk_yhat = None
        if daily_forecast_bookings:
            bk_dates = pd.DatetimeIndex(pd.to_datetime(daily_forecast_bookings.dates))
            bk_vals = np.array(daily_forecast_bookings.yhat, dtype=np.float64)
            bk_sliced = slice_daily_to_month(bk_dates, bk_vals, None, None, year, month)
            if bk_sliced["covered_days"] == covered:
                bk_yhat = bk_sliced["yhat"]
        pred, lo, hi = aggregate_avg_check_weighted(s_yhat, s_lower, s_upper, bk_yhat)
    elif metric in _MEAN_METRICS:
        pred, lo, hi = aggregate_month_mean(s_yhat, s_lower, s_upper)
    else:
        pred, lo, hi = aggregate_month_sum(s_yhat, s_lower, s_upper)

    status: str = "full" if covered == total else "partial"
    first, last = month_date_range(year, month)
    notes: dict[str, Any] = {"aggregation": "calendar_month"}
    if metric in _MEAN_METRICS:
        notes["value_type"] = "mean"
    elif metric == "avg_check":
        notes["value_type"] = "weighted_mean" if (daily_forecast_bookings is not None) else "mean"
    else:
        notes["value_type"] = "sum"

    return MonthlyRollupResult(
        metric=metric, year=year, month=month,
        period_start=first.strftime("%Y-%m-%d"),
        period_end=last.strftime("%Y-%m-%d"),
        status=status, covered_days=covered, total_days=total,
        coverage_ratio=round(covered / total, 4),
        predicted_total=pred, lower_total=lo, upper_total=hi,
        model_family_used=daily_forecast.model_family or daily_forecast.model_name,
        last_updated_timestamp=now_ts,
        notes=notes,
    )
