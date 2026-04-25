"""Holiday and special event provider for forecast regressors."""

from __future__ import annotations

import importlib
import logging
import os
import sys
from datetime import date
from typing import Optional

import numpy as np
import pandas as pd

from config import HOLIDAY_COUNTRY_DEFAULT

logger = logging.getLogger(__name__)

_holidays_pkg = None


def _get_holidays_package():
    """Import the python-holidays pip package, avoiding collision with this module."""
    global _holidays_pkg
    if _holidays_pkg is not None:
        return _holidays_pkg

    my_dir = os.path.abspath(os.path.dirname(__file__))
    cwd = os.getcwd()
    saved_mod = sys.modules.pop("holidays", None)
    orig_path = list(sys.path)
    try:
        sys.path = [
            p for p in orig_path
            if (os.path.abspath(p) if p else cwd) != my_dir
        ]
        if "holidays" in sys.modules:
            del sys.modules["holidays"]
        mod = importlib.import_module("holidays")
        if hasattr(mod, "country_holidays"):
            _holidays_pkg = mod
            return mod
    except ImportError:
        pass
    finally:
        sys.path = orig_path
        if saved_mod is not None:
            sys.modules["holidays"] = saved_mod
    return None


class HolidayProvider:
    def __init__(self, country: str = HOLIDAY_COUNTRY_DEFAULT):
        self.country = country
        self._lib = _get_holidays_package()
        if self._lib is None:
            logger.debug("python-holidays not installed; holiday features disabled")

    def holidays_df(self, start_date: date, end_date: date) -> pd.DataFrame:
        if self._lib is None:
            return pd.DataFrame(columns=["ds", "holiday"])
        try:
            # Temporarily swap sys.modules so the package's internal
            # `getattr(holidays, ...)` resolves to itself, not our module.
            saved = sys.modules.get("holidays")
            sys.modules["holidays"] = self._lib
            try:
                h = self._lib.country_holidays(
                    self.country,
                    years=list(range(start_date.year, end_date.year + 1)),
                )
            finally:
                if saved is not None:
                    sys.modules["holidays"] = saved
                else:
                    sys.modules.pop("holidays", None)

            rows = [
                {"ds": pd.Timestamp(d), "holiday": name}
                for d, name in sorted(h.items())
                if start_date <= d <= end_date
            ]
            return pd.DataFrame(rows) if rows else pd.DataFrame(columns=["ds", "holiday"])
        except Exception as e:
            logger.warning("Holiday lookup failed: %s", e)
            return pd.DataFrame(columns=["ds", "holiday"])


class SpecialEventProvider:
    def __init__(self, load_fn=None):
        self._load_fn = load_fn

    def events_df(self, start_date: date, end_date: date) -> pd.DataFrame:
        if self._load_fn is None:
            return pd.DataFrame(columns=["ds", "event_name"])
        try:
            return self._load_fn(start_date, end_date)
        except Exception:
            return pd.DataFrame(columns=["ds", "event_name"])


def build_holiday_flags(
    dates: pd.DatetimeIndex,
    holidays_df: pd.DataFrame,
    events_df: pd.DataFrame,
) -> pd.DataFrame:
    flags = pd.DataFrame(index=dates)
    flags["is_holiday"] = 0.0
    flags["is_event"] = 0.0

    if not holidays_df.empty and "ds" in holidays_df.columns:
        hset = set(pd.to_datetime(holidays_df["ds"]).dt.normalize())
        flags["is_holiday"] = [1.0 if d in hset else 0.0 for d in dates.normalize()]

    if not events_df.empty and "ds" in events_df.columns:
        eset = set(pd.to_datetime(events_df["ds"]).dt.normalize())
        flags["is_event"] = [1.0 if d in eset else 0.0 for d in dates.normalize()]

    return flags


def merge_prophet_holidays(
    holidays_df: pd.DataFrame, events_df: pd.DataFrame
) -> pd.DataFrame:
    """Merge holidays + events into Prophet-compatible DataFrame (ds, holiday)."""
    parts = []
    if not holidays_df.empty:
        h = holidays_df[["ds", "holiday"]].copy()
        h["ds"] = pd.to_datetime(h["ds"])
        parts.append(h)
    if not events_df.empty and "ds" in events_df.columns and "event_name" in events_df.columns:
        e = events_df[["ds", "event_name"]].rename(columns={"event_name": "holiday"}).copy()
        e["ds"] = pd.to_datetime(e["ds"])
        parts.append(e)
    if parts:
        return pd.concat(parts, ignore_index=True)
    return pd.DataFrame(columns=["ds", "holiday"])
