"""Tests for model selector logic."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest
from types_ import TimeSeries, ModelCandidate
from selector import select_model


def _make_ts(n: int = 200, name: str = "test") -> TimeSeries:
    np.random.seed(42)
    dates = pd.date_range("2025-01-01", periods=n, freq="D")
    values = 100 + np.sin(np.arange(n) * 2 * np.pi / 7) * 20 + np.random.randn(n) * 5
    return TimeSeries(dates=dates, values=values, name=name)


class TestSelector:
    def test_short_series_returns_baseline(self):
        ts = TimeSeries(
            dates=pd.date_range("2025-01-01", periods=50, freq="D"),
            values=np.random.randn(50) + 10,
            name="short",
        )
        result = select_model(ts, "revenue")
        assert result.model_name == "ma7"
        assert any("insufficient_data" in w for w in result.warnings)

    def test_returns_valid_candidate(self):
        ts = _make_ts(250)
        result = select_model(ts, "utilization", horizon=14, step=7, max_candidates_sarima=5)
        assert result.is_valid
        assert result.model_name in ("sarima", "ma7", "same_day_last_week", "prophet", "sarimax_exog")
        assert result.mean_mape < 1.0

    def test_baseline_gate_works(self):
        np.random.seed(99)
        ts = TimeSeries(
            dates=pd.date_range("2025-01-01", periods=200, freq="D"),
            values=np.random.randn(200) * 1000 + 5000,
            name="noisy",
        )
        result = select_model(ts, "revenue", horizon=14, step=7, max_candidates_sarima=5)
        assert result.is_valid or result.model_name in ("ma7", "same_day_last_week")

    def test_model_family_set(self):
        ts = _make_ts(200)
        result = select_model(ts, "utilization", max_candidates_sarima=3)
        assert result.model_family is not None
        assert result.model_family in ("baseline", "sarima", "prophet", "sarimax_exog")
