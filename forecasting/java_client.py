"""
Fetch training data from Java backend. No DB access in FastAPI.
"""
from __future__ import annotations

import logging
import os
from datetime import date, timedelta
from typing import Any, Optional

import pandas as pd
import requests

from types_ import TimeSeries
import numpy as np

logger = logging.getLogger(__name__)

JAVA_BACKEND_URL = os.environ.get("JAVA_BACKEND_URL", "http://localhost:8080").rstrip("/")


def get_orders_data(from_date: date, to_date: date, token: str) -> list[dict[str, Any]]:
    """Call Java /api/internal/forecast-data/orders. Returns list of {day, revenue, itemsCount}."""
    url = f"{JAVA_BACKEND_URL}/api/internal/forecast-data/orders"
    params = {"from": from_date.isoformat(), "to": to_date.isoformat()}
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    try:
        r = requests.get(url, params=params, headers=headers, timeout=30)
        data = r.json() if r.content else []
        if r.status_code != 200:
            logger.warning(
                "Java forecast-data/orders returned %s: %s",
                r.status_code,
                data if isinstance(data, dict) else "(list len=%s)" % (len(data) if isinstance(data, list) else "?"),
            )
            return []
        if not data:
            logger.warning(
                "Java forecast-data/orders returned 200 but empty list (from=%s to=%s). "
                "Проверьте: заказы со status=CLOSED и closed_at не null для ресторана из JWT.",
                from_date,
                to_date,
            )
        else:
            logger.info("Java forecast-data/orders returned %s rows for %s..%s", len(data), from_date, to_date)
        return data
    except requests.RequestException as e:
        logger.warning("Java backend request failed: %s", e)
        return []


def orders_to_revenue_timeseries(rows: list[dict], since: date) -> TimeSeries:
    """Convert Java orders response to TimeSeries (revenue). Java: day, revenue, itemsCount."""
    if not rows:
        return TimeSeries(pd.DatetimeIndex([]), np.array([]), "revenue")
    df = pd.DataFrame(rows)
    df["ds"] = pd.to_datetime(df["day"])
    df["y"] = pd.to_numeric(df["revenue"], errors="coerce").fillna(0.0)
    df = df.set_index("ds").sort_index()
    df = df[~df.index.duplicated(keep="last")]
    if df.empty:
        return TimeSeries(pd.DatetimeIndex([]), np.array([]), "revenue")
    full = pd.date_range(df.index.min(), df.index.max(), freq="D")
    df = df.reindex(full)
    df["y"] = df["y"].fillna(0.0)
    return TimeSeries(
        dates=pd.DatetimeIndex(df.index),
        values=df["y"].values.astype(np.float64),
        name="revenue",
    )


def orders_to_bookings_timeseries(rows: list[dict], since: date) -> TimeSeries:
    """Convert Java orders response to TimeSeries (bookings = itemsCount per day)."""
    if not rows:
        return TimeSeries(pd.DatetimeIndex([]), np.array([]), "bookings")
    df = pd.DataFrame(rows)
    df["ds"] = pd.to_datetime(df["day"])
    # Java: itemsCount (camelCase in JSON)
    col = "itemsCount" if "itemsCount" in df.columns else "items_count"
    df["y"] = pd.to_numeric(df.get(col, pd.Series(0, index=df.index)), errors="coerce").fillna(0.0)
    df = df.set_index("ds").sort_index()
    df = df[~df.index.duplicated(keep="last")]
    if df.empty:
        return TimeSeries(pd.DatetimeIndex([]), np.array([]), "bookings")
    full = pd.date_range(df.index.min(), df.index.max(), freq="D")
    df = df.reindex(full)
    df["y"] = df["y"].fillna(0.0)
    return TimeSeries(
        dates=pd.DatetimeIndex(df.index),
        values=df["y"].values.astype(np.float64),
        name="bookings",
    )
