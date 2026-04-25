"""Tests for regressor construction."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest

from types_ import TimeSeries
from regressors import build_train_exog, build_future_exog, available_regressors


def _make_ts(n=100, name="test"):
    dates = pd.date_range("2025-01-01", periods=n, freq="D")
    values = np.random.randn(n) + 10
    return TimeSeries(dates=dates, values=values, name=name)


class TestRegressors:
    def test_available_regressors(self):
        base = {"bookings": _make_ts(100, "bookings"), "utilization": _make_ts(100, "utilization")}
        avail = available_regressors(base)
        assert "bookings" in avail
        assert "utilization" in avail

    def test_build_train_exog_shape(self):
        dates = pd.date_range("2025-01-01", periods=100, freq="D")
        base = {
            "bookings": TimeSeries(dates, np.random.randn(100) + 10, "bookings"),
            "utilization": TimeSeries(dates, np.random.randn(100) + 50, "utilization"),
        }
        flags = pd.DataFrame({"is_holiday": np.zeros(100), "is_event": np.zeros(100)}, index=dates)
        exog = build_train_exog("revenue", dates, base, flags)
        assert len(exog) == 100
        assert "bookings" in exog.columns
        assert "utilization" in exog.columns
        assert "is_holiday" in exog.columns

    def test_future_exog_shape(self):
        dates = pd.date_range("2025-01-01", periods=100, freq="D")
        base = {"bookings": TimeSeries(dates, np.random.randn(100) + 10, "bookings")}
        flags = pd.DataFrame({"is_holiday": np.zeros(100), "is_event": np.zeros(100)}, index=dates)
        history_exog = build_train_exog("revenue", dates, base, flags)

        future_dates = pd.date_range("2025-04-11", periods=14, freq="D")
        future_flags = pd.DataFrame({"is_holiday": np.zeros(14), "is_event": np.zeros(14)}, index=future_dates)
        future_exog = build_future_exog("revenue", future_dates, history_exog, future_flags)
        assert len(future_exog) == 14
        assert set(future_exog.columns) == set(history_exog.columns)

    def test_seasonal_last_week_strategy(self):
        dates = pd.date_range("2025-01-01", periods=100, freq="D")
        base = {"bookings": TimeSeries(dates, np.arange(100, dtype=float), "bookings")}
        flags = pd.DataFrame({"is_holiday": np.zeros(100)}, index=dates)
        hist = build_train_exog("revenue", dates, base, flags)

        future_dates = pd.date_range("2025-04-11", periods=14, freq="D")
        future_flags = pd.DataFrame({"is_holiday": np.zeros(14)}, index=future_dates)
        fut = build_future_exog("revenue", future_dates, hist, future_flags, strategy="seasonal_last_week")
        assert len(fut) == 14
        assert np.all(np.isfinite(fut["bookings"].values))
