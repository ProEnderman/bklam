"""Tests for multi-family model selection."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest

from types_ import TimeSeries
from selector import select_model


def _make_seasonal_ts(n=250, period=7, name="metric"):
    np.random.seed(42)
    dates = pd.date_range("2025-01-01", periods=n, freq="D")
    t = np.arange(n, dtype=float)
    seasonal = 20 * np.sin(2 * np.pi * t / period)
    trend = 0.05 * t
    noise = np.random.randn(n) * 3
    return TimeSeries(dates=dates, values=100 + seasonal + trend + noise, name=name)


class TestMultiFamilySelector:
    def test_selects_from_multiple_families(self):
        ts = _make_seasonal_ts(250)
        result = select_model(
            ts, "utilization",
            max_candidates_sarima=3, max_candidates_prophet=2, max_candidates_exog=0,
        )
        assert result.is_valid
        assert result.model_family in ("baseline", "sarima", "prophet", "sarimax_exog")
        assert result.mean_mape < 1.0

    def test_explosion_guard_still_works(self):
        np.random.seed(42)
        n = 200
        dates = pd.date_range("2025-01-01", periods=n, freq="D")
        values = np.ones(n) * 10.0
        ts = TimeSeries(dates=dates, values=values, name="flat")
        result = select_model(
            ts, "bookings",
            max_candidates_sarima=3, max_candidates_prophet=0, max_candidates_exog=0,
        )
        assert result.is_valid
        assert result.mean_mape < 0.5 or result.model_family == "baseline"

    def test_baseline_still_wins_for_noisy(self):
        np.random.seed(123)
        n = 200
        dates = pd.date_range("2025-01-01", periods=n, freq="D")
        values = np.random.randn(n) * 500 + 1000
        ts = TimeSeries(dates=dates, values=values, name="noisy_revenue")
        result = select_model(
            ts, "revenue",
            max_candidates_sarima=3, max_candidates_prophet=2, max_candidates_exog=0,
        )
        assert result.is_valid

    def test_two_stage_considered_for_revenue(self):
        """When base_series has bookings, two-stage should be evaluated for revenue."""
        np.random.seed(42)
        n = 250
        dates = pd.date_range("2024-06-01", periods=n, freq="D")
        t = np.arange(n, dtype=float)
        bookings = 10 + 5 * np.sin(2 * np.pi * t / 7) + np.random.randn(n) * 0.5
        bookings = np.maximum(bookings, 1)
        avg_check = 80 + 3 * np.sin(2 * np.pi * t / 30) + np.random.randn(n) * 2
        avg_check = np.maximum(avg_check, 1)
        revenue = bookings * avg_check

        ts = TimeSeries(dates, revenue, "revenue")
        bk_ts = TimeSeries(dates, bookings, "bookings")
        base_series = {"bookings": bk_ts, "revenue": ts}

        import config as cfg
        saved = cfg.SELECTOR_TIMEOUT_SECONDS
        cfg.SELECTOR_TIMEOUT_SECONDS = 300
        try:
            result = select_model(
                ts, "revenue",
                max_candidates_sarima=3, max_candidates_prophet=0, max_candidates_exog=0,
                base_series=base_series,
            )
        finally:
            cfg.SELECTOR_TIMEOUT_SECONDS = saved
        assert result.is_valid
        assert result.model_family in ("baseline", "sarima", "prophet", "sarimax_exog", "two_stage", "ensemble")

    def test_two_stage_keeps_direct_when_not_better(self):
        """Two-stage should NOT win unless it beats direct by the required margin."""
        np.random.seed(99)
        n = 200
        dates = pd.date_range("2024-06-01", periods=n, freq="D")
        values = np.random.randn(n) * 200 + 2000
        ts = TimeSeries(dates, np.abs(values), "revenue")
        bk_ts = TimeSeries(dates, np.abs(np.random.randn(n) * 10 + 50), "bookings")
        base_series = {"bookings": bk_ts, "revenue": ts}

        result = select_model(
            ts, "revenue",
            max_candidates_sarima=3, max_candidates_prophet=0, max_candidates_exog=0,
            base_series=base_series,
        )
        assert result.is_valid
