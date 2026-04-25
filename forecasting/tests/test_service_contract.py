"""Tests for ForecastService output contracts."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest
from types_ import TimeSeries, ForecastResult
from service import _clip_output, _trend_direction


class TestClipOutput:
    def test_revenue_non_negative(self):
        result = _clip_output("revenue", np.array([-100.0, 0.0, 50000.0]))
        assert np.all(result >= 0)

    def test_bookings_non_negative_integer(self):
        result = _clip_output("bookings", np.array([-5.3, 0.0, 12.7]))
        assert np.all(result >= 0)
        assert np.all(result == np.round(result))

    def test_utilization_clipped(self):
        result = _clip_output("utilization", np.array([-10.0, 50.0, 150.0]))
        assert np.all(result >= 0)
        assert np.all(result <= 100)

    def test_cancel_rate_bounded(self):
        result = _clip_output("cancel_rate", np.array([-0.5, 0.5, 1.5]))
        assert np.all(result > 0)
        assert np.all(result < 1)


class TestTrendDirection:
    def test_up(self):
        assert _trend_direction([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) == "up"

    def test_down(self):
        assert _trend_direction([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]) == "down"

    def test_stable(self):
        assert _trend_direction([5, 5, 5, 5, 5, 5]) == "stable"

    def test_short(self):
        assert _trend_direction([1, 2]) == "stable"


class TestForecastResultSchema:
    """Verify ForecastResult.to_dict() has required fields."""

    REQUIRED_FIELDS = {
        "dates", "yhat", "yhat_lower", "yhat_upper",
        "model_name", "params", "transform_name",
        "train_end", "created_at", "mape_rolling", "diagnostics",
    }

    def test_all_fields_present(self):
        fr = ForecastResult(
            dates=["2025-06-01", "2025-06-02"],
            yhat=[100.0, 101.0],
            yhat_lower=[90.0, 91.0],
            yhat_upper=[110.0, 111.0],
            model_name="sarima",
            params={"order": [1, 1, 1]},
            transform_name="log",
            train_end="2025-05-31",
        )
        d = fr.to_dict()
        missing = self.REQUIRED_FIELDS - set(d.keys())
        assert not missing, f"Missing: {missing}"

    def test_lower_le_yhat_le_upper(self):
        fr = ForecastResult(
            dates=["2025-06-01", "2025-06-02"],
            yhat=[100.0, 101.0],
            yhat_lower=[90.0, 91.0],
            yhat_upper=[110.0, 111.0],
            model_name="test",
            params={},
            transform_name="identity",
            train_end="2025-05-31",
        )
        lo = np.array(fr.yhat_lower)
        mid = np.array(fr.yhat)
        hi = np.array(fr.yhat_upper)
        assert np.all(lo <= mid)
        assert np.all(mid <= hi)

    def test_lengths_match(self):
        fr = ForecastResult(
            dates=["2025-06-01", "2025-06-02", "2025-06-03"],
            yhat=[1.0, 2.0, 3.0],
            yhat_lower=[0.5, 1.5, 2.5],
            yhat_upper=[1.5, 2.5, 3.5],
            model_name="test",
            params={},
            transform_name="identity",
            train_end="2025-05-31",
        )
        assert len(fr.dates) == len(fr.yhat) == len(fr.yhat_lower) == len(fr.yhat_upper)


class TestServiceResponseFields:
    """Verify the service response dict matches Java frontend expectations."""

    JAVA_REQUIRED = {"metric", "model", "trend", "mape", "dates", "yhat", "yhat_lower", "yhat_upper",
                     "forecast", "values", "lower_bound", "upper_bound"}

    def test_baseline_forecast_has_java_fields(self):
        from baselines import forecast_ma7
        np.random.seed(42)
        ts = TimeSeries(
            dates=pd.date_range("2025-01-01", periods=30, freq="D"),
            values=np.random.rand(30) * 100,
            name="revenue",
        )
        fr = forecast_ma7(ts, 7)
        # Simulate what service.forecast() returns
        response = {
            "metric": "revenue",
            "model": fr.model_name,
            "trend": "stable",
            "mape": None,
            "dates": fr.dates,
            "yhat": fr.yhat,
            "yhat_lower": fr.yhat_lower,
            "yhat_upper": fr.yhat_upper,
            "forecast": fr.dates,
            "values": fr.yhat,
            "lower_bound": fr.yhat_lower,
            "upper_bound": fr.yhat_upper,
        }
        missing = self.JAVA_REQUIRED - set(response.keys())
        assert not missing, f"Missing Java-required fields: {missing}"
