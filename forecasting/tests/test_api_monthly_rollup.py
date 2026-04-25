"""Tests for monthly rollup API endpoints."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest
from unittest.mock import patch, MagicMock

from fastapi.testclient import TestClient
from types_ import ForecastResult


def _make_daily_forecast(metric="revenue", start="2026-09-01", days=30):
    dates = pd.date_range(start, periods=days, freq="D")
    yhat = np.full(days, 1000.0)
    return ForecastResult(
        dates=[d.strftime("%Y-%m-%d") for d in dates],
        yhat=yhat.tolist(),
        yhat_lower=(yhat * 0.9).tolist(),
        yhat_upper=(yhat * 1.1).tolist(),
        model_name="sarima",
        model_family="sarima",
        params={},
        transform_name="identity",
        train_end=(dates[0] - pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
    )


@pytest.fixture
def client():
    from api import app
    return TestClient(app)


class TestPeriodDefaultDailyUnchanged:
    """Existing daily endpoint must still respond with the old schema."""

    def test_daily_default(self, client):
        with patch("service.ForecastService.forecast") as mock_fc:
            mock_fc.return_value = {
                "metric": "revenue", "model": "sarima", "model_family": "sarima",
                "transform": "log", "params": {}, "horizon": 14,
                "train_end": "2026-01-01", "created_at": "2026-01-02",
                "mape_rolling": 5.0, "trend": "up", "mape": 5.0,
                "dates": ["2026-01-02"], "yhat": [100.0],
                "yhat_lower": [90.0], "yhat_upper": [110.0],
                "diagnostics": {},
                "forecast": ["2026-01-02"], "values": [100.0],
                "lower_bound": [90.0], "upper_bound": [110.0],
            }
            resp = client.get("/api/forecast/revenue")
            assert resp.status_code == 200
            data = resp.json()
            assert "yhat" in data
            assert "dates" in data


class TestPeriodMonthValidation:
    def test_month_requires_year_and_month(self, client):
        resp = client.get("/api/forecast/revenue?period=month")
        assert resp.status_code == 400

    def test_month_requires_month_param(self, client):
        resp = client.get("/api/forecast/revenue?period=month&year=2026")
        assert resp.status_code == 400

    def test_unknown_metric(self, client):
        resp = client.get("/api/forecast/nonexistent?period=month&year=2026&month=9")
        assert resp.status_code == 404


class TestPeriodMonthReturnsRollupSchema:
    def test_monthly_rollup_response(self, client):
        with patch("service.ForecastService.get_monthly_forecast") as mock_monthly:
            mock_monthly.return_value = {
                "metric": "revenue", "year": 2026, "month": 9,
                "period_start": "2026-09-01", "period_end": "2026-09-30",
                "status": "full", "covered_days": 30, "total_days": 30,
                "coverage_ratio": 1.0,
                "predicted_total": 30000.0,
                "lower_total": 27000.0, "upper_total": 33000.0,
                "model_family_used": "ensemble_weekday",
                "last_updated_timestamp": "2026-09-01T00:00:00",
                "notes": {"aggregation": "calendar_month"},
            }
            resp = client.get("/api/forecast/revenue?period=month&year=2026&month=9")
            assert resp.status_code == 200
            data = resp.json()
            assert data["metric"] == "revenue"
            assert data["status"] == "full"
            assert data["predicted_total"] == 30000.0
            assert data["coverage_ratio"] == 1.0
            assert data["notes"]["aggregation"] == "calendar_month"


class TestMonthlyAccuracyEndpoint:
    def test_returns_list(self, client):
        with patch("registry.get_monthly_accuracy") as mock_acc:
            mock_acc.return_value = [{"metric": "revenue", "year": 2025, "month": 12, "smape": 4.5}]
            resp = client.get("/api/forecast/revenue/monthly-accuracy")
            assert resp.status_code == 200
            data = resp.json()
            assert isinstance(data, list)
            assert len(data) == 1
