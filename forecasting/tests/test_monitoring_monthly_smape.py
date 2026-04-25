"""Tests for monthly forecast-vs-actual monitoring."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from monitoring import monthly_smape, monthly_mae, evaluate_monthly_accuracy


class TestMonthlySmape:
    def test_basic(self):
        assert monthly_smape(100.0, 100.0) == pytest.approx(0.0, abs=0.01)

    def test_symmetric(self):
        s1 = monthly_smape(100.0, 120.0)
        s2 = monthly_smape(120.0, 100.0)
        assert s1 == pytest.approx(s2)

    def test_range(self):
        s = monthly_smape(100.0, 0.0)
        assert 0 <= s <= 200.0

    def test_both_zero(self):
        s = monthly_smape(0.0, 0.0)
        assert s == pytest.approx(0.0, abs=0.01)


class TestMonthlyMae:
    def test_basic(self):
        assert monthly_mae(100.0, 110.0) == pytest.approx(10.0)

    def test_symmetric(self):
        assert monthly_mae(100.0, 80.0) == monthly_mae(80.0, 100.0)


class TestEvaluateMonthlyAccuracy:
    def test_structure(self):
        entry = evaluate_monthly_accuracy("revenue", 2026, 1, 50000.0, 48000.0)
        assert entry["metric"] == "revenue"
        assert entry["year"] == 2026
        assert entry["month"] == 1
        assert entry["predicted_total"] == 50000.0
        assert entry["actual_total"] == 48000.0
        assert entry["actual_type"] == "sum"
        assert "smape" in entry
        assert "mae" in entry
        assert "evaluated_at" in entry
        assert entry["mae"] == pytest.approx(2000.0)

    def test_mean_metric_type(self):
        entry = evaluate_monthly_accuracy("utilization", 2026, 3, 70.0, 72.0)
        assert entry["actual_type"] == "mean"

    def test_only_when_closed(self):
        """monitoring.evaluate_monthly_accuracy is a pure function;
        the closed-month check lives in service.run_monthly_monitoring."""
        entry = evaluate_monthly_accuracy("revenue", 2099, 12, 100.0, 100.0)
        assert entry["smape"] == pytest.approx(0.0, abs=0.01)
