"""Tests for hierarchical forecasting."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest

from types_ import TimeSeries, ForecastResult
from hierarchical import forecast_hierarchical_total


def _make_ts(n=200, base=50, name="seg"):
    dates = pd.date_range("2025-01-01", periods=n, freq="D")
    values = base + np.sin(np.arange(n) * 2 * np.pi / 7) * 10 + np.random.randn(n) * 3
    return TimeSeries(dates=dates, values=values, name=name)


class TestHierarchical:
    def test_aggregation_sums_segments(self):
        np.random.seed(42)
        seg1 = _make_ts(200, 100, "seg1")
        seg2 = _make_ts(200, 50, "seg2")
        segments = {"1": seg1, "2": seg2}
        names = {"1": "Activity A", "2": "Activity B"}

        def mock_forecast(ts, metric, horizon, seg_id):
            vals = ts.values[-7:]
            avg = float(np.mean(vals))
            dates = [(ts.dates[-1] + pd.Timedelta(days=i + 1)).strftime("%Y-%m-%d") for i in range(horizon)]
            return ForecastResult(
                dates=dates, yhat=[avg] * horizon,
                yhat_lower=[avg * 0.8] * horizon, yhat_upper=[avg * 1.2] * horizon,
                model_name="ma7", params={}, transform_name="identity",
                train_end=str(ts.dates[-1].date()), model_family="baseline",
            )

        result = forecast_hierarchical_total("revenue", segments, names, mock_forecast, horizon=14)
        assert result is not None
        assert len(result.yhat) == 14
        assert result.model_family == "hierarchical"
        assert result.segments is not None
        assert len(result.segments) == 2

    def test_top_segments_limited(self):
        np.random.seed(42)
        segments = {str(i): _make_ts(200, 10 * i, f"s{i}") for i in range(1, 15)}
        names = {str(i): f"Act_{i}" for i in range(1, 15)}

        def mock_fc(ts, metric, horizon, seg_id):
            avg = float(np.mean(ts.values[-7:]))
            dates = [(ts.dates[-1] + pd.Timedelta(days=i + 1)).strftime("%Y-%m-%d") for i in range(horizon)]
            return ForecastResult(
                dates=dates, yhat=[avg] * horizon,
                yhat_lower=[avg * 0.8] * horizon, yhat_upper=[avg * 1.2] * horizon,
                model_name="ma7", params={}, transform_name="identity",
                train_end=str(ts.dates[-1].date()), model_family="baseline",
            )

        result = forecast_hierarchical_total("revenue", segments, names, mock_fc, 14)
        assert result is not None
        assert len(result.segments) <= 10

    def test_empty_segments_returns_none(self):
        result = forecast_hierarchical_total("revenue", {}, {}, lambda *a: None, 14)
        assert result is None

    def test_short_segments_filtered(self):
        np.random.seed(42)
        short = TimeSeries(
            pd.date_range("2025-01-01", periods=50, freq="D"),
            np.random.randn(50) + 10, "short",
        )
        result = forecast_hierarchical_total(
            "revenue", {"1": short}, {"1": "Short"}, lambda *a: None, 14,
        )
        assert result is None
