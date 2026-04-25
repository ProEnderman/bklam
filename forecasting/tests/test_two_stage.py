"""Tests for two-stage (factorized) revenue model."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest

from types_ import TimeSeries, ForecastResult, ModelCandidate
from two_stage import compose_revenue_forecast, evaluate_two_stage_candidate
from avg_check import compute_avg_check_series


def _make_ts(values, name="test", start="2024-01-01"):
    n = len(values)
    dates = pd.date_range(start, periods=n, freq="D")
    return TimeSeries(dates=dates, values=np.array(values, dtype=np.float64), name=name)


def _synthetic_series(n=365, avg_check_mean=80.0, avg_check_std=5.0):
    """Build synthetic bookings + avg_check → revenue with weekly pattern."""
    np.random.seed(42)
    t = np.arange(n)
    weekly = 10 + 5 * np.sin(2 * np.pi * t / 7)
    trend = 0.01 * t
    bookings = np.maximum(weekly + trend + np.random.normal(0, 1, n), 1)

    avg_check = avg_check_mean + avg_check_std * np.sin(2 * np.pi * t / 30) + np.random.normal(0, 2, n)
    avg_check = np.maximum(avg_check, 1.0)

    revenue = bookings * avg_check

    dates = pd.date_range("2024-06-01", periods=n, freq="D")
    return (
        TimeSeries(dates, revenue, "revenue"),
        TimeSeries(dates, bookings, "bookings"),
        TimeSeries(dates, avg_check, "avg_check"),
    )


class TestComposeRevenueForecast:

    def test_basic_composition(self):
        bk_yhat = np.array([10.0, 20.0, 30.0])
        ac_yhat = np.array([50.0, 60.0, 70.0])
        yhat, lo, hi = compose_revenue_forecast(
            bk_yhat, bk_yhat * 0.9, bk_yhat * 1.1,
            ac_yhat, ac_yhat * 0.9, ac_yhat * 1.1,
        )
        assert len(yhat) == 3
        np.testing.assert_allclose(yhat, bk_yhat * ac_yhat, rtol=0.01)

    def test_intervals_monotone(self):
        bk = np.array([10, 20, 30], dtype=float)
        ac = np.array([50, 60, 70], dtype=float)
        yhat, lo, hi = compose_revenue_forecast(
            bk, bk * 0.8, bk * 1.2,
            ac, ac * 0.8, ac * 1.2,
        )
        assert all(lo <= yhat)
        assert all(hi >= yhat)

    def test_non_negative(self):
        bk = np.array([0.0, 1.0, 0.5])
        ac = np.array([0.0, 10.0, 5.0])
        yhat, lo, hi = compose_revenue_forecast(
            bk, bk, bk + 1,
            ac, ac, ac + 5,
        )
        assert all(yhat >= 0)
        assert all(lo >= 0)

    def test_log_composition_matches(self):
        """Log composition: exp(log(bk) + log(ac)) ≈ bk * ac for positive values."""
        bk = np.array([10.0, 20.0])
        ac = np.array([50.0, 60.0])
        yhat, _, _ = compose_revenue_forecast(
            bk, bk * 0.9, bk * 1.1,
            ac, ac * 0.9, ac * 1.1,
        )
        np.testing.assert_allclose(yhat, bk * ac, rtol=1e-6)


class TestEvaluateTwoStageCandidate:

    def test_insufficient_history(self):
        rev = _make_ts(np.ones(50) * 100)
        bk = _make_ts(np.ones(50) * 10)
        ac = _make_ts(np.ones(50) * 10)
        cand = evaluate_two_stage_candidate(rev, bk, ac, timeout_seconds=5)
        assert not cand.is_valid
        assert "insufficient_history" in cand.warnings

    def test_valid_synthetic_series(self):
        rev, bk, ac = _synthetic_series(n=300)
        cand = evaluate_two_stage_candidate(
            rev, bk, ac,
            horizon=14, step=7,
            timeout_seconds=120,
        )
        assert cand.model_family == "two_stage"
        assert cand.composed is True
        assert len(cand.backtest_scores) > 0

    def test_model_candidate_fields(self):
        rev, bk, ac = _synthetic_series(n=200)
        cand = evaluate_two_stage_candidate(rev, bk, ac, timeout_seconds=60)
        assert cand.model_name == "two_stage"
        assert cand.transform_name == "composed"
        assert cand.model_family == "two_stage"
        assert cand.composed is True


class TestAvgCheckSeriesIntegration:

    def test_compute_and_use(self):
        rev, bk, _ = _synthetic_series(n=200)
        ac = compute_avg_check_series(rev, bk)
        assert len(ac) > 0
        assert all(np.isfinite(ac.values))
        assert all(ac.values > 0)

    def test_explosion_guard_on_explosive_avg_check(self):
        """Explosive avg_check should trigger guard on composed forecast."""
        n = 200
        bk_vals = np.ones(n) * 10
        ac_vals = np.ones(n) * 50
        ac_vals[-14:] = 1e8  # explosive
        rev_vals = bk_vals * ac_vals

        rev = _make_ts(rev_vals)
        bk = _make_ts(bk_vals)
        ac = _make_ts(ac_vals)

        bk_yhat = np.ones(14) * 10
        ac_yhat = np.ones(14) * 1e8  # explosive forecast
        yhat, lo, hi = compose_revenue_forecast(
            bk_yhat, bk_yhat * 0.9, bk_yhat * 1.1,
            ac_yhat, ac_yhat * 0.9, ac_yhat * 1.1,
        )

        from diagnostics import explosion_guard
        recent = rev_vals[:n - 14]
        guard = explosion_guard(yhat, recent[-56:])
        assert guard["explosion_guard_triggered"]
