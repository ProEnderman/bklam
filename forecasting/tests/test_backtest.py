"""Tests for rolling backtest engine."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pytest
from types_ import TimeSeries
from transforms import IdentityTransform
from backtest import compute_folds, rolling_backtest, evaluate_candidate
import pandas as pd


def _make_ts(n: int = 200, name: str = "test") -> TimeSeries:
    np.random.seed(42)
    dates = pd.date_range("2025-01-01", periods=n, freq="D")
    values = 100 + np.sin(np.arange(n) * 2 * np.pi / 7) * 20 + np.random.randn(n) * 5
    return TimeSeries(dates=dates, values=values, name=name)


class TestComputeFolds:
    def test_deterministic(self):
        folds1 = compute_folds(200, horizon=14, step=7, min_train=90)
        folds2 = compute_folds(200, horizon=14, step=7, min_train=90)
        assert folds1 == folds2

    def test_minimum_train_size(self):
        folds = compute_folds(200, horizon=14, step=7, min_train=90)
        for train_end, test_end in folds:
            assert train_end >= 90
            assert test_end <= 200

    def test_short_series_few_folds(self):
        folds = compute_folds(100, horizon=14, step=7, min_train=90)
        assert len(folds) <= 2

    def test_sufficient_folds(self):
        folds = compute_folds(300, horizon=14, step=7, min_train=90)
        assert len(folds) >= 6


class TestRollingBacktest:
    def test_identity_passthrough(self):
        ts = _make_ts(200)
        transform = IdentityTransform()

        def perfect_fn(y_t, h):
            yhat = np.full(h, np.mean(y_t[-7:]))
            return yhat, yhat - 10, yhat + 10, {}

        scores, diag, debug = rolling_backtest(ts, transform, perfect_fn)
        assert len(scores) > 0
        assert all(np.isfinite(s) for s in scores)

    def test_explosion_guard_triggers(self):
        ts = _make_ts(200)
        transform = IdentityTransform()

        def exploding_fn(y_t, h):
            yhat = np.full(h, np.max(y_t) * 100)
            return yhat, yhat, yhat, {}

        scores, diag, debug = rolling_backtest(ts, transform, exploding_fn)
        assert any("explosion" in w for w in diag.get("warnings", []))

    def test_debug_report_populated(self):
        ts = _make_ts(200)
        transform = IdentityTransform()

        def ok_fn(y_t, h):
            yhat = np.full(h, np.mean(y_t[-7:]))
            return yhat, yhat - 10, yhat + 10, {}

        scores, diag, debug = rolling_backtest(
            ts, transform, ok_fn, metric_name="revenue", model_name="test"
        )
        assert debug is not None
        assert len(debug.folds) > 0
        assert debug.mean_mape is not None
        assert debug.mean_smape is not None


class TestEvaluateCandidate:
    def test_valid_candidate(self):
        ts = _make_ts(200)
        transform = IdentityTransform()

        def ok_fn(y_t, h):
            yhat = np.full(h, np.mean(y_t[-7:]))
            return yhat, yhat - 10, yhat + 10, {}

        cand, debug = evaluate_candidate(ts, transform, ok_fn, "test_model", {"p": 1})
        assert cand.model_name == "test_model"
        assert cand.mean_mape < 1.0
        assert len(cand.backtest_scores) > 0

    def test_failing_fn_produces_invalid(self):
        ts = _make_ts(200)
        transform = IdentityTransform()

        def fail_fn(y_t, h):
            return None, None, None, {"warnings": ["always_fail"]}

        cand, debug = evaluate_candidate(ts, transform, fail_fn, "bad_model", {})
        assert cand.mean_mape >= 0.50
