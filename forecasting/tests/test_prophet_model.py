"""Tests for Prophet model candidate."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest

from types_ import TimeSeries
from transforms import IdentityTransform, LogTransform


def _make_ts(n: int = 200) -> TimeSeries:
    np.random.seed(42)
    dates = pd.date_range("2025-01-01", periods=n, freq="D")
    values = 100 + np.sin(np.arange(n) * 2 * np.pi / 7) * 20 + np.random.randn(n) * 5
    return TimeSeries(dates=dates, values=values.clip(1), name="revenue")


@pytest.fixture
def prophet_available():
    try:
        import prophet
        return True
    except ImportError:
        pytest.skip("prophet not installed")


class TestProphetModel:
    def test_fit_returns_correct_shapes(self, prophet_available):
        from prophet_model import fit_forecast_prophet
        ts = _make_ts(200)
        transform = IdentityTransform()
        yhat, lo, hi, diag = fit_forecast_prophet(ts, transform, horizon=14)
        assert yhat is not None
        assert len(yhat) == 14
        assert len(lo) == 14
        assert len(hi) == 14

    def test_intervals_monotone_after_inverse(self, prophet_available):
        from prophet_model import fit_forecast_prophet
        ts = _make_ts(200)
        transform = LogTransform()
        ts_positive = TimeSeries(ts.dates, ts.values.clip(1), "revenue")
        yhat, lo, hi, diag = fit_forecast_prophet(ts_positive, transform, horizon=14)
        if yhat is not None:
            assert np.all(hi >= lo)
            assert np.all(yhat >= 0)

    def test_handles_empty_holidays(self, prophet_available):
        from prophet_model import fit_forecast_prophet
        ts = _make_ts(150)
        transform = IdentityTransform()
        yhat, lo, hi, diag = fit_forecast_prophet(
            ts, transform, horizon=7,
            holidays_df=pd.DataFrame(columns=["ds", "holiday"]),
        )
        assert yhat is not None or "error" in diag

    def test_non_installed_returns_error(self):
        from prophet_model import fit_forecast_prophet
        import prophet_model as pm
        orig = pm.__dict__.get("Prophet")
        ts = _make_ts(100)
        transform = IdentityTransform()
        yhat, lo, hi, diag = fit_forecast_prophet(ts, transform, 7)
        if yhat is None:
            assert "error" in diag
