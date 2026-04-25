"""Tests for calendar-month aggregation logic."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest

from types_ import ForecastResult
from aggregation import (
    month_date_range,
    slice_daily_to_month,
    aggregate_month_sum,
    aggregate_month_mean,
    aggregate_avg_check_weighted,
    build_monthly_rollup,
    MonthlyRollupResult,
)


def _make_forecast(dates, yhat, lower=None, upper=None, model_family="sarima") -> ForecastResult:
    n = len(dates)
    if lower is None:
        lower = [v * 0.9 for v in yhat]
    if upper is None:
        upper = [v * 1.1 for v in yhat]
    return ForecastResult(
        dates=[d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else d for d in dates],
        yhat=list(yhat),
        yhat_lower=list(lower),
        yhat_upper=list(upper),
        model_name="test",
        model_family=model_family,
        params={},
        transform_name="identity",
        train_end="2026-01-01",
    )


class TestMonthDateRange:
    def test_jan(self):
        first, last = month_date_range(2026, 1)
        assert first == pd.Timestamp("2026-01-01")
        assert last == pd.Timestamp("2026-01-31")

    def test_feb_non_leap(self):
        first, last = month_date_range(2025, 2)
        assert last == pd.Timestamp("2025-02-28")

    def test_feb_leap(self):
        first, last = month_date_range(2024, 2)
        assert last == pd.Timestamp("2024-02-29")


class TestSliceDailyToMonth:
    def test_full_coverage(self):
        dates = pd.date_range("2026-03-01", periods=31, freq="D")
        yhat = np.arange(31, dtype=float)
        result = slice_daily_to_month(dates, yhat, None, None, 2026, 3)
        assert result["covered_days"] == 31
        assert result["total_days"] == 31
        assert len(result["yhat"]) == 31

    def test_partial_coverage(self):
        dates = pd.date_range("2026-03-10", periods=14, freq="D")
        yhat = np.ones(14)
        result = slice_daily_to_month(dates, yhat, None, None, 2026, 3)
        assert result["covered_days"] == 14
        assert result["total_days"] == 31

    def test_no_overlap(self):
        dates = pd.date_range("2026-04-01", periods=10, freq="D")
        yhat = np.ones(10)
        result = slice_daily_to_month(dates, yhat, None, None, 2026, 3)
        assert result["covered_days"] == 0


class TestSumRollupRevenue:
    def test_full_month(self):
        dates = pd.date_range("2026-01-01", periods=31, freq="D")
        yhat = np.full(31, 1000.0)
        fc = _make_forecast(dates, yhat)

        rollup = build_monthly_rollup("revenue", 2026, 1, fc, None, "2026-02-01T00:00:00")
        assert rollup.status == "full"
        assert rollup.covered_days == 31
        assert rollup.total_days == 31
        assert rollup.coverage_ratio == 1.0
        assert rollup.predicted_total == pytest.approx(31000.0)
        assert rollup.lower_total is not None
        assert rollup.lower_total < rollup.predicted_total
        assert rollup.upper_total > rollup.predicted_total

    def test_partial_month(self):
        dates = pd.date_range("2026-01-01", periods=14, freq="D")
        yhat = np.full(14, 500.0)
        fc = _make_forecast(dates, yhat)

        rollup = build_monthly_rollup("revenue", 2026, 1, fc, None, "2026-01-15T00:00:00")
        assert rollup.status == "partial"
        assert rollup.covered_days == 14
        assert rollup.coverage_ratio == pytest.approx(14 / 31, abs=0.01)
        assert rollup.predicted_total == pytest.approx(7000.0)


class TestMeanRollupUtilization:
    def test_mean_aggregation(self):
        dates = pd.date_range("2026-06-01", periods=30, freq="D")
        yhat = np.full(30, 75.0)
        lower = np.full(30, 70.0)
        upper = np.full(30, 80.0)
        fc = _make_forecast(dates, yhat, lower, upper, model_family="sarima")

        rollup = build_monthly_rollup("utilization", 2026, 6, fc, None, "now")
        assert rollup.status == "full"
        assert rollup.predicted_total == pytest.approx(75.0)
        assert rollup.lower_total == pytest.approx(70.0)
        assert rollup.upper_total == pytest.approx(80.0)
        assert rollup.notes.get("value_type") == "mean"


class TestAvgCheckWeighted:
    def test_weighted_by_bookings(self):
        ac = np.array([100.0, 200.0, 300.0])
        bk = np.array([10.0, 20.0, 30.0])
        pred, lo, hi = aggregate_avg_check_weighted(ac, None, None, bk)
        expected = (100*10 + 200*20 + 300*30) / (10+20+30)
        assert pred == pytest.approx(expected)
        assert lo is None

    def test_falls_back_to_mean(self):
        ac = np.array([100.0, 200.0, 300.0])
        pred, _, _ = aggregate_avg_check_weighted(ac, None, None, None)
        assert pred == pytest.approx(200.0)

    def test_zero_bookings_fallback(self):
        ac = np.array([100.0, 200.0])
        bk = np.array([0.0, 0.0])
        pred, _, _ = aggregate_avg_check_weighted(ac, None, None, bk)
        assert pred == pytest.approx(150.0)


class TestNoData:
    def test_no_data_status(self):
        dates = pd.date_range("2026-05-01", periods=10, freq="D")
        yhat = np.ones(10)
        fc = _make_forecast(dates, yhat)

        rollup = build_monthly_rollup("revenue", 2026, 8, fc, None, "now")
        assert rollup.status == "no_data"
        assert rollup.covered_days == 0
        assert rollup.predicted_total == 0.0


class TestMonthlyRollupToDict:
    def test_serializable(self):
        dates = pd.date_range("2026-09-01", periods=14, freq="D")
        yhat = np.full(14, 100.0)
        fc = _make_forecast(dates, yhat)
        rollup = build_monthly_rollup("revenue", 2026, 9, fc, None, "2026-09-15T00:00:00")
        d = rollup.to_dict()
        assert d["metric"] == "revenue"
        assert d["year"] == 2026
        assert d["month"] == 9
        assert d["status"] == "partial"
        assert isinstance(d["predicted_total"], float)
        assert isinstance(d["notes"], dict)
        assert d["notes"]["aggregation"] == "calendar_month"


class TestPerSegmentBreakdown:
    """Test the per-activity monthly breakdown logic used by
    get_monthly_forecast_by_segment (aggregation primitives only)."""

    def test_segment_slicing_and_sum(self):
        """Multiple segments sliced to same month produce independent totals."""
        dates = pd.date_range("2026-03-01", periods=31, freq="D")

        seg_a = np.full(31, 10.0)
        seg_b = np.full(31, 5.0)

        sl_a = slice_daily_to_month(dates, seg_a, None, None, 2026, 3)
        sl_b = slice_daily_to_month(dates, seg_b, None, None, 2026, 3)

        sum_a, _, _ = aggregate_month_sum(sl_a["yhat"], None, None)
        sum_b, _, _ = aggregate_month_sum(sl_b["yhat"], None, None)

        assert sum_a == pytest.approx(310.0)
        assert sum_b == pytest.approx(155.0)
        assert sl_a["covered_days"] == 31
        assert sl_b["covered_days"] == 31

    def test_segment_partial_coverage(self):
        """A segment whose forecast only covers part of the month."""
        dates = pd.date_range("2026-06-10", periods=14, freq="D")
        yhat = np.full(14, 8.0)
        lower = np.full(14, 6.0)
        upper = np.full(14, 10.0)

        sl = slice_daily_to_month(dates, yhat, lower, upper, 2026, 6)
        assert sl["covered_days"] == 14
        assert sl["total_days"] == 30

        total, lo, hi = aggregate_month_sum(sl["yhat"], sl["lower"], sl["upper"])
        assert total == pytest.approx(112.0)
        assert lo is not None and lo < total
        assert hi is not None and hi > total

    def test_residual_other_bucket(self):
        """When segment totals don't add up to the overall total,
        the residual should be positive."""
        total_pred = 500.0
        seg_totals = [200.0, 150.0, 80.0]
        residual = total_pred - sum(seg_totals)
        assert residual == pytest.approx(70.0)
        assert residual > 0
