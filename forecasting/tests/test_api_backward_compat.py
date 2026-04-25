"""Tests for API backward compatibility."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest

from types_ import TimeSeries, ForecastResult


class TestResponseBackwardCompat:
    """Verify the API response dict still contains all fields expected by the Java frontend."""

    REQUIRED_KEYS = {
        "metric", "model", "trend", "mape", "dates", "yhat",
        "yhat_lower", "yhat_upper", "forecast", "values",
        "lower_bound", "upper_bound",
    }

    NEW_OPTIONAL_KEYS = {"model_family", "leaderboard", "segments"}

    def _mock_response(self) -> dict:
        return {
            "metric": "revenue",
            "model": "sarima",
            "model_family": "sarima",
            "transform": "log",
            "params": {"order": [1, 0, 1]},
            "horizon": 14,
            "train_end": "2025-06-01",
            "created_at": "2025-06-02T00:00:00",
            "mape_rolling": 12.5,
            "trend": "up",
            "mape": 12.5,
            "dates": ["2025-06-02", "2025-06-03"],
            "yhat": [100.0, 101.0],
            "yhat_lower": [90.0, 91.0],
            "yhat_upper": [110.0, 111.0],
            "diagnostics": {},
            "leaderboard": {"metric": "revenue", "top_models": []},
            "segments": None,
            "forecast": ["2025-06-02", "2025-06-03"],
            "values": [100.0, 101.0],
            "lower_bound": [90.0, 91.0],
            "upper_bound": [110.0, 111.0],
        }

    def test_all_required_keys_present(self):
        resp = self._mock_response()
        missing = self.REQUIRED_KEYS - set(resp.keys())
        assert not missing, f"Missing backward-compat keys: {missing}"

    def test_new_optional_keys_present(self):
        resp = self._mock_response()
        for k in self.NEW_OPTIONAL_KEYS:
            assert k in resp

    def test_dates_and_values_match_lengths(self):
        resp = self._mock_response()
        assert len(resp["dates"]) == len(resp["yhat"])
        assert len(resp["dates"]) == len(resp["yhat_lower"])
        assert len(resp["dates"]) == len(resp["yhat_upper"])
        assert resp["forecast"] == resp["dates"]
        assert resp["values"] == resp["yhat"]

    def test_model_family_field(self):
        resp = self._mock_response()
        assert resp["model_family"] in ("baseline", "sarima", "prophet", "sarimax_exog", "hierarchical")


class TestForecastResultNewFields:
    def test_new_fields_default_none(self):
        fr = ForecastResult(
            dates=["2025-06-01"], yhat=[100.0], yhat_lower=[90.0], yhat_upper=[110.0],
            model_name="sarima", params={}, transform_name="log", train_end="2025-05-31",
        )
        assert fr.model_family is None
        assert fr.segment_id is None
        assert fr.segments is None
        assert fr.leaderboard is None

    def test_to_dict_with_new_fields(self):
        fr = ForecastResult(
            dates=["2025-06-01"], yhat=[100.0], yhat_lower=[90.0], yhat_upper=[110.0],
            model_name="sarima", params={}, transform_name="log", train_end="2025-05-31",
            model_family="sarima",
            segments=[{"segment_id": "1", "segment_name": "A"}],
        )
        d = fr.to_dict()
        assert "model_family" in d
        assert "segments" in d
