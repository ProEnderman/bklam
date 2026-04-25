"""Persistence: model specs, forecasts, historical data from Java API only (no DB)."""

from __future__ import annotations

import calendar
import json
import logging
import os
from datetime import date, timedelta
from typing import Optional

import numpy as np
import pandas as pd

from config import SPECS_DIR
from forecast_context import get_forecast_token
from java_client import get_orders_data, orders_to_revenue_timeseries, orders_to_bookings_timeseries
from types_ import TimeSeries, ForecastResult

logger = logging.getLogger(__name__)


def _empty_ts(name: str, since: date) -> TimeSeries:
    return TimeSeries(pd.DatetimeIndex([]), np.array([]), name)


# ──────────────────────────────────────────────
#  Aggregate loaders (revenue via Java API; others no DB)
# ──────────────────────────────────────────────

def load_daily_revenue(rid: Optional[int] = None, since: Optional[date] = None, token: Optional[str] = None) -> TimeSeries:
    since = since or date.today() - timedelta(days=400)
    token = token or get_forecast_token()
    if not token:
        logger.warning("load_daily_revenue: no forecast token in context (TenantContext/JWT not set for this request)")
        return _empty_ts("revenue", since)
    to_date = date.today()
    rows = get_orders_data(since, to_date, token)
    return orders_to_revenue_timeseries(rows, since)


def load_daily_bookings(rid: Optional[int] = None, since: Optional[date] = None, token: Optional[str] = None) -> TimeSeries:
    since = since or date.today() - timedelta(days=400)
    token = token or get_forecast_token()
    if not token:
        logger.warning("load_daily_bookings: no forecast token in context")
        return _empty_ts("bookings", since)
    to_date = date.today()
    rows = get_orders_data(since, to_date, token)
    return orders_to_bookings_timeseries(rows, since)


def load_daily_cancel_rate(rid: Optional[int] = None, since: Optional[date] = None, token: Optional[str] = None) -> TimeSeries:
    since = since or date.today() - timedelta(days=400)
    return _empty_ts("cancel_rate", since)


def load_daily_utilization(rid: Optional[int] = None, since: Optional[date] = None, token: Optional[str] = None) -> TimeSeries:
    since = since or date.today() - timedelta(days=400)
    return _empty_ts("utilization", since)


_LOADERS = {
    "revenue": load_daily_revenue,
    "bookings": load_daily_bookings,
    "cancel_rate": load_daily_cancel_rate,
    "utilization": load_daily_utilization,
}


def load_daily_avg_check(rid: Optional[int] = None, token: Optional[str] = None) -> TimeSeries:
    """Compute avg_check from revenue and bookings (no direct DB column)."""
    from avg_check import compute_avg_check_series
    rev = load_daily_revenue(rid=rid, token=token)
    bk = load_daily_bookings(rid=rid, token=token)
    return compute_avg_check_series(rev, bk)


def load_metric(metric: str, rid: Optional[int] = None, token: Optional[str] = None) -> TimeSeries:
    if metric == "avg_check":
        return load_daily_avg_check(rid=rid, token=token)
    loader = _LOADERS.get(metric)
    if loader is None:
        raise ValueError(f"Unknown metric: {metric}")
    return loader(rid=rid, token=token)


# ──────────────────────────────────────────────
#  Per-activity / segment loaders (no DB)
# ──────────────────────────────────────────────

def list_segments() -> list[dict]:
    return []


def load_daily_revenue_by_activity(since: Optional[date] = None) -> dict[str, TimeSeries]:
    return {}


def load_daily_bookings_by_activity(since: Optional[date] = None) -> dict[str, TimeSeries]:
    return {}


def load_special_events(start_date: date, end_date: date) -> pd.DataFrame:
    return pd.DataFrame(columns=["ds", "event_name"])


def load_base_series(rid: Optional[int] = None, token: Optional[str] = None) -> dict[str, TimeSeries]:
    """Load all core metric series for use as regressors."""
    result = {}
    for name, loader in _LOADERS.items():
        try:
            result[name] = loader(rid=rid, token=token)
        except Exception:
            pass
    return result


# ──────────────────────────────────────────────
#  Reindexing (used by java_client.orders_to_revenue_timeseries inline)
# ──────────────────────────────────────────────

def _to_ts(df: pd.DataFrame, name: str, since: date) -> TimeSeries:
    if df.empty:
        return TimeSeries(pd.DatetimeIndex([]), np.array([]), name)

    df["ds"] = pd.to_datetime(df["ds"], utc=False)
    if hasattr(df["ds"].dt, "tz") and df["ds"].dt.tz is not None:
        df["ds"] = df["ds"].dt.tz_localize(None)
    df["ds"] = df["ds"].dt.normalize()
    df = df.set_index("ds").sort_index()
    df = df[~df.index.duplicated(keep="last")]

    full = pd.date_range(df.index.min(), df.index.max(), freq="D")
    df = df.reindex(full)

    df["y"] = df["y"].ffill(limit=2)
    df["y"] = df["y"].interpolate(method="linear", limit=3, limit_direction="both")
    if df["y"].isna().any():
        roll_mean = df["y"].rolling(7, min_periods=1).mean()
        df["y"] = df["y"].fillna(roll_mean)
    if df["y"].isna().any():
        df["y"] = df["y"].fillna(df["y"].median())

    return TimeSeries(
        dates=pd.DatetimeIndex(df.index),
        values=df["y"].values.astype(np.float64),
        name=name,
    )


# ──────────────────────────────────────────────
#  Spec / forecast persistence (file-based)
# ──────────────────────────────────────────────

def _specs_dir(tenant_id: Optional[int] = None) -> str:
    """Base directory for specs: SPECS_DIR or SPECS_DIR/<tenant_id> for per-restaurant storage."""
    if tenant_id is not None:
        d = os.path.join(SPECS_DIR, str(tenant_id))
        os.makedirs(d, exist_ok=True)
        return d
    os.makedirs(SPECS_DIR, exist_ok=True)
    return SPECS_DIR


def save_spec(metric: str, spec: dict, tenant_id: Optional[int] = None) -> None:
    base = _specs_dir(tenant_id)
    path = os.path.join(base, f"{metric}.json")
    with open(path, "w") as f:
        json.dump(spec, f, indent=2, default=str)


def load_spec(metric: str, tenant_id: Optional[int] = None) -> Optional[dict]:
    base = _specs_dir(tenant_id)
    path = os.path.join(base, f"{metric}.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def save_forecast_result(metric: str, result: ForecastResult, tenant_id: Optional[int] = None) -> None:
    base = _specs_dir(tenant_id)
    path = os.path.join(base, f"{metric}_forecast.json")
    with open(path, "w") as f:
        json.dump(result.to_dict(), f, indent=2, default=str)


def load_latest_forecast(metric: str, tenant_id: Optional[int] = None) -> Optional[ForecastResult]:
    """Load latest forecast. When tenant_id is set, do NOT fall back to legacy specs/ (avoids showing
    another tenant's or synthetic data to a restaurant that has no own forecast)."""
    base = _specs_dir(tenant_id)
    path = os.path.join(base, f"{metric}_forecast.json")
    if not os.path.exists(path):
        return None
    with open(path) as f:
        d = json.load(f)
    valid_fields = set(ForecastResult.__dataclass_fields__)
    return ForecastResult(**{k: v for k, v in d.items() if k in valid_fields})


# ──────────────────────────────────────────────
#  Monthly rollup persistence (file-based, per-tenant when tenant_id is set)
# ──────────────────────────────────────────────

def _monthly_dir(tenant_id: Optional[int] = None) -> str:
    base = _specs_dir(tenant_id)
    monthly = os.path.join(base, "monthly")
    os.makedirs(monthly, exist_ok=True)
    return monthly


def _monthly_path(metric: str, year: int, month: int, tenant_id: Optional[int] = None) -> str:
    return os.path.join(_monthly_dir(tenant_id), f"{metric}_{year}_{month:02d}.json")


def save_monthly_rollup(rollup, tenant_id: Optional[int] = None) -> None:
    """Persist a MonthlyRollupResult to disk."""
    path = _monthly_path(rollup.metric, rollup.year, rollup.month, tenant_id)
    with open(path, "w") as f:
        json.dump(rollup.to_dict(), f, indent=2, default=str)


def load_monthly_rollup(metric: str, year: int, month: int, tenant_id: Optional[int] = None):
    """Load a stored MonthlyRollupResult dict or None. When tenant_id is set, do NOT fall back to
    legacy specs/monthly/ (avoids showing another tenant's cached rollup)."""
    path = _monthly_path(metric, year, month, tenant_id)
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def list_monthly_rollups(metric: str, limit: int = 24, tenant_id: Optional[int] = None) -> list[dict]:
    d = _monthly_dir(tenant_id)
    prefix = f"{metric}_"
    results = []
    if not os.path.isdir(d):
        return results
    for fname in sorted(os.listdir(d), reverse=True):
        if fname.startswith(prefix) and fname.endswith(".json"):
            try:
                with open(os.path.join(d, fname)) as f:
                    results.append(json.load(f))
            except (json.JSONDecodeError, OSError):
                pass
        if len(results) >= limit:
            break
    return results


def load_actual_monthly(metric: str, year: int, month: int, token: Optional[str] = None) -> Optional[float]:
    """Total actual for the month from Java orders. Returns None if no token or no data."""
    if metric == "avg_check":
        rev_daily = load_daily_actuals_for_month("revenue", year, month, token=token)
        bk_daily = load_daily_actuals_for_month("bookings", year, month, token=token)
        if not rev_daily or not bk_daily:
            return None
        total_rev = sum(rev_daily.values())
        total_bk = sum(bk_daily.values())
        return (total_rev / total_bk) if total_bk else None
    daily = load_daily_actuals_for_month(metric, year, month, token=token)
    if not daily:
        return None
    return sum(daily.values())


def load_daily_actuals_for_month(
    metric: str, year: int, month: int, token: Optional[str] = None,
) -> dict[str, float]:
    """Per-day actuals for the month from Java orders. Keys: 'YYYY-MM-DD', values: revenue or bookings."""
    token = token or get_forecast_token()
    if not token:
        return {}
    first = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    last = date(year, month, last_day)
    rows = get_orders_data(first, last, token)
    if not rows:
        return {}
    df = pd.DataFrame(rows)
    df["day_str"] = pd.to_datetime(df["day"]).dt.strftime("%Y-%m-%d")
    revenue_col = "revenue" if "revenue" in df.columns else "y"
    items_col = "itemsCount" if "itemsCount" in df.columns else "items_count"
    df["_rev"] = pd.to_numeric(df.get(revenue_col, 0), errors="coerce").fillna(0.0)
    df["_bk"] = pd.to_numeric(df.get(items_col, 0), errors="coerce").fillna(0.0)
    by_day = df.groupby("day_str").agg(_rev=("_rev", "sum"), _bk=("_bk", "sum"))
    if metric == "revenue":
        return by_day["_rev"].to_dict()
    if metric == "bookings":
        return by_day["_bk"].to_dict()
    if metric == "avg_check":
        by_day["val"] = by_day["_rev"] / by_day["_bk"].replace(0, np.nan)
        return by_day["val"].fillna(0.0).to_dict()
    return {}


def month_is_closed(year: int, month: int, now: Optional[pd.Timestamp] = None, tz: str = "Europe/Zurich") -> bool:
    """Check if a calendar month has ended in the business timezone."""
    if now is None:
        now = pd.Timestamp.now(tz=tz)
    elif now.tzinfo is None:
        now = now.tz_localize(tz)
    if month == 12:
        first_next = pd.Timestamp(year=year + 1, month=1, day=1, tz=tz)
    else:
        first_next = pd.Timestamp(year=year, month=month + 1, day=1, tz=tz)
    return now >= first_next
