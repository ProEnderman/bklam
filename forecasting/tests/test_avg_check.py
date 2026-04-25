"""Tests for avg_check series computation."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest

from types_ import TimeSeries
from avg_check import compute_avg_check_series


def _make_ts(values, name="test", days=None):
    n = len(values)
    dates = pd.date_range("2025-01-01", periods=n, freq="D") if days is None else days
    return TimeSeries(dates=dates, values=np.array(values, dtype=np.float64), name=name)


class TestAvgCheckComputation:

    def test_basic_computation(self):
        rev = _make_ts([100, 200, 300, 400])
        bk = _make_ts([10, 20, 30, 40])
        ac = compute_avg_check_series(rev, bk)
        assert len(ac) == 4
        np.testing.assert_allclose(ac.values, [10.0, 10.0, 10.0, 10.0], atol=0.01)

    def test_bookings_zero_imputed(self):
        """Bookings=0 days should be imputed, never 0 or inf."""
        rev_vals = [100.0] * 30
        bk_vals = [10.0] * 28 + [0.0, 0.0]
        rev = _make_ts(rev_vals)
        bk = _make_ts(bk_vals)
        ac = compute_avg_check_series(rev, bk)
        assert len(ac) == 30
        assert all(np.isfinite(ac.values))
        assert all(ac.values > 0)

    def test_all_bookings_zero(self):
        """Extreme: all bookings = 0 → fallback imputation."""
        rev = _make_ts([100.0] * 10)
        bk = _make_ts([0.0] * 10)
        ac = compute_avg_check_series(rev, bk)
        assert len(ac) == 10
        assert all(np.isfinite(ac.values))
        assert all(ac.values > 0)

    def test_clipping_applied(self):
        """Extreme avg_check values should be clipped."""
        from config import TWO_STAGE_AVG_CHECK_CLIP
        lo, hi = TWO_STAGE_AVG_CHECK_CLIP
        rev = _make_ts([1e15, 50, 100])
        bk = _make_ts([1, 50, 100])
        ac = compute_avg_check_series(rev, bk)
        assert all(ac.values >= lo)
        assert all(ac.values <= hi)

    def test_alignment_preserved(self):
        """Dates must align between revenue and bookings."""
        dates_rev = pd.date_range("2025-01-01", periods=10, freq="D")
        dates_bk = pd.date_range("2025-01-03", periods=10, freq="D")
        rev = TimeSeries(dates_rev, np.ones(10) * 100, "revenue")
        bk = TimeSeries(dates_bk, np.ones(10) * 10, "bookings")
        ac = compute_avg_check_series(rev, bk)
        overlap = dates_rev.intersection(dates_bk)
        assert len(ac) == len(overlap)
        assert (ac.dates == overlap).all()

    def test_no_overlap_returns_empty(self):
        dates_rev = pd.date_range("2025-01-01", periods=5, freq="D")
        dates_bk = pd.date_range("2025-03-01", periods=5, freq="D")
        rev = TimeSeries(dates_rev, np.ones(5) * 100, "revenue")
        bk = TimeSeries(dates_bk, np.ones(5) * 10, "bookings")
        ac = compute_avg_check_series(rev, bk)
        assert len(ac) == 0

    def test_name_is_avg_check(self):
        rev = _make_ts([100, 200])
        bk = _make_ts([10, 20])
        ac = compute_avg_check_series(rev, bk)
        assert ac.name == "avg_check"

    def test_varied_avg_check(self):
        rev = _make_ts([50, 100, 150, 200, 250])
        bk = _make_ts([5, 10, 15, 20, 25])
        ac = compute_avg_check_series(rev, bk)
        np.testing.assert_allclose(ac.values, [10.0, 10.0, 10.0, 10.0, 10.0], atol=0.01)
