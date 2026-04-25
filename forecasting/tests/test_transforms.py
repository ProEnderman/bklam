"""Tests for variance-stabilizing transforms."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pytest
from transforms import (
    IdentityTransform, LogTransform, Log1pTransform, LogitTransform, get_transform,
)


class TestIdentityTransform:
    def test_roundtrip(self):
        t = IdentityTransform()
        y = np.array([1.0, 5.0, 100.0])
        np.testing.assert_array_almost_equal(t.inverse(t.forward(y)), y)


class TestLogTransform:
    def test_roundtrip(self):
        t = LogTransform()
        y = np.array([10.0, 100.0, 50000.0])
        np.testing.assert_array_almost_equal(t.inverse(t.forward(y)), y, decimal=5)

    def test_handles_near_zero(self):
        t = LogTransform()
        y = np.array([0.0, 1e-10, 1.0])
        fwd = t.forward(y)
        assert np.all(np.isfinite(fwd))
        inv = t.inverse(fwd)
        assert np.all(inv >= 0)

    def test_interval_monotonicity(self):
        t = LogTransform()
        lo_t = np.array([1.0, 2.0, 3.0])
        hi_t = np.array([2.0, 3.0, 4.0])
        lo, hi = t.inverse_interval(lo_t, hi_t)
        assert np.all(hi >= lo)


class TestLog1pTransform:
    def test_roundtrip(self):
        t = Log1pTransform()
        y = np.array([0.0, 1.0, 50.0, 200.0])
        np.testing.assert_array_almost_equal(t.inverse(t.forward(y)), y, decimal=5)

    def test_handles_zeros(self):
        t = Log1pTransform()
        y = np.array([0.0, 0.0, 0.0])
        fwd = t.forward(y)
        inv = t.inverse(fwd)
        np.testing.assert_array_almost_equal(inv, y)

    def test_interval_non_negative(self):
        t = Log1pTransform()
        lo_t = np.array([-5.0, 0.0])
        hi_t = np.array([0.0, 5.0])
        lo, hi = t.inverse_interval(lo_t, hi_t)
        assert np.all(lo >= 0)
        assert np.all(hi >= lo)


class TestLogitTransform:
    def test_roundtrip(self):
        t = LogitTransform()
        y = np.array([0.05, 0.15, 0.50, 0.85])
        result = t.inverse(t.forward(y))
        np.testing.assert_array_almost_equal(result, y, decimal=5)

    def test_clips_extremes(self):
        t = LogitTransform()
        y = np.array([0.0, 1.0, -0.1, 1.5])
        fwd = t.forward(y)
        assert np.all(np.isfinite(fwd))
        inv = t.inverse(fwd)
        assert np.all(inv > 0)
        assert np.all(inv < 1)

    def test_interval_bounded(self):
        t = LogitTransform()
        lo_t = np.array([-3.0, 0.0])
        hi_t = np.array([0.0, 3.0])
        lo, hi = t.inverse_interval(lo_t, hi_t)
        assert np.all(lo > 0)
        assert np.all(hi < 1)
        assert np.all(hi >= lo)


class TestGetTransform:
    def test_revenue(self):
        assert get_transform("revenue").name == "log"

    def test_bookings(self):
        assert get_transform("bookings").name == "log1p"

    def test_utilization(self):
        assert get_transform("utilization").name == "identity"

    def test_cancel_rate(self):
        assert get_transform("cancel_rate").name == "logit"

    def test_unknown_defaults_identity(self):
        assert get_transform("unknown_metric").name == "identity"
