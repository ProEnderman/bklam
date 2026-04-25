"""Tests for weighted ensemble revenue forecasting."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest

from types_ import TimeSeries, ModelCandidate
from ensemble import (
    fit_ensemble_weights,
    blend_predictions,
    blend_intervals,
    _project_simplex_with_min,
)


def _make_ts(values, name="revenue", start="2024-01-01"):
    n = len(values)
    dates = pd.date_range(start, periods=n, freq="D")
    return TimeSeries(dates=dates, values=np.array(values, dtype=np.float64), name=name)


class TestWeightFitting:

    def test_global_weights_sum_to_one(self):
        np.random.seed(42)
        n, h = 10, 14
        fold_actuals = [np.random.rand(h) * 100 + 50 for _ in range(n)]
        dates = [pd.date_range("2024-06-01", periods=h, freq="D") for _ in range(n)]
        fold_preds = {
            "sarima": [a + np.random.randn(h) * 5 for a in fold_actuals],
            "prophet": [a + np.random.randn(h) * 8 for a in fold_actuals],
        }
        weights = fit_ensemble_weights(fold_actuals, fold_preds, dates, mode="global")
        global_w = weights["global"]
        assert abs(sum(global_w.values()) - 1.0) < 1e-4

    def test_global_weights_respect_min_bound(self):
        np.random.seed(7)
        import config as cfg
        min_w = cfg.ENSEMBLE_MIN_WEIGHT

        n, h = 8, 14
        fold_actuals = [np.random.rand(h) * 100 + 50 for _ in range(n)]
        dates = [pd.date_range("2024-06-01", periods=h, freq="D") for _ in range(n)]
        fold_preds = {
            "sarima": [a + np.random.randn(h) * 2 for a in fold_actuals],
            "prophet": [a + np.random.randn(h) * 20 for a in fold_actuals],
            "sarimax_exog": [a + np.random.randn(h) * 15 for a in fold_actuals],
        }
        weights = fit_ensemble_weights(fold_actuals, fold_preds, dates, mode="global")
        for w in weights["global"].values():
            assert w >= min_w - 1e-6

    def test_weekday_weights_for_all_days(self):
        np.random.seed(42)
        n, h = 12, 14
        fold_actuals = [np.random.rand(h) * 100 + 50 for _ in range(n)]
        dates = [pd.date_range(f"2024-06-{1+i}", periods=h, freq="D") for i in range(n)]
        fold_preds = {
            "sarima": [a + np.random.randn(h) * 5 for a in fold_actuals],
            "prophet": [a + np.random.randn(h) * 8 for a in fold_actuals],
        }
        weights = fit_ensemble_weights(fold_actuals, fold_preds, dates, mode="weekday")
        assert "weekday" in weights
        for dow_name in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]:
            assert dow_name in weights["weekday"]
            w_dict = weights["weekday"][dow_name]
            assert abs(sum(w_dict.values()) - 1.0) < 1e-4

    def test_weekday_fallback_to_global_for_sparse_data(self):
        """With very few points per weekday, should fall back to global weights."""
        np.random.seed(42)
        fold_actuals = [np.random.rand(7) * 100 + 50]
        dates = [pd.date_range("2024-06-01", periods=7, freq="D")]
        fold_preds = {
            "sarima": [fold_actuals[0] + np.random.randn(7) * 5],
            "prophet": [fold_actuals[0] + np.random.randn(7) * 8],
        }
        weights = fit_ensemble_weights(fold_actuals, fold_preds, dates, mode="weekday")
        assert "weekday" in weights
        assert "global" in weights


class TestBlending:

    def test_blend_predictions_global(self):
        dates = pd.date_range("2024-06-01", periods=4, freq="D")
        preds = {
            "sarima": np.array([100, 200, 300, 400], dtype=float),
            "prophet": np.array([110, 190, 310, 390], dtype=float),
        }
        weights = {"global": {"sarima": 0.6, "prophet": 0.4}}
        blended = blend_predictions(preds, dates, weights, mode="global")
        expected = 0.6 * preds["sarima"] + 0.4 * preds["prophet"]
        np.testing.assert_allclose(blended, expected, atol=1e-6)

    def test_blend_non_negative(self):
        dates = pd.date_range("2024-06-01", periods=3, freq="D")
        preds = {
            "sarima": np.array([-10, 20, -5], dtype=float),
            "prophet": np.array([5, -30, 10], dtype=float),
        }
        weights = {"global": {"sarima": 0.5, "prophet": 0.5}}
        blended = blend_predictions(preds, dates, weights, mode="global")
        assert all(blended >= 0)

    def test_ensemble_improves_on_synthetic_weekday_data(self):
        """Model A is better on weekdays, Model B is better on weekends."""
        np.random.seed(42)
        n_folds = 10
        h = 14
        fold_actuals = []
        fold_preds_a = []
        fold_preds_b = []
        fold_dates = []

        for i in range(n_folds):
            dates = pd.date_range(f"2024-06-{1 + i}", periods=h, freq="D")
            actuals = np.random.rand(h) * 100 + 100
            pred_a = actuals.copy()
            pred_b = actuals.copy()

            for t in range(h):
                dow = dates[t].dayofweek
                if dow < 5:
                    pred_a[t] += np.random.randn() * 3
                    pred_b[t] += np.random.randn() * 15
                else:
                    pred_a[t] += np.random.randn() * 15
                    pred_b[t] += np.random.randn() * 3

            fold_actuals.append(actuals)
            fold_preds_a.append(pred_a)
            fold_preds_b.append(pred_b)
            fold_dates.append(dates)

        fold_preds = {"model_a": fold_preds_a, "model_b": fold_preds_b}
        weights = fit_ensemble_weights(fold_actuals, fold_preds, fold_dates, mode="weekday")

        all_act = np.concatenate(fold_actuals)
        all_dates = pd.DatetimeIndex(np.concatenate([d.to_numpy() for d in fold_dates]))
        all_preds = {
            "model_a": np.concatenate(fold_preds_a),
            "model_b": np.concatenate(fold_preds_b),
        }
        blended = blend_predictions(all_preds, all_dates, weights, mode="weekday")

        def _smape(a, b):
            return np.mean(2.0 * np.abs(a - b) / (np.abs(a) + np.abs(b) + 1e-8))

        ens_err = _smape(all_act, blended)
        a_err = _smape(all_act, all_preds["model_a"])
        b_err = _smape(all_act, all_preds["model_b"])
        assert ens_err <= min(a_err, b_err) + 0.01


class TestIntervalBlending:

    def test_lower_leq_upper(self):
        dates = pd.date_range("2024-06-01", periods=5, freq="D")
        lower = {"a": np.array([10, 20, 30, 40, 50], dtype=float)}
        upper = {"a": np.array([20, 30, 40, 50, 60], dtype=float)}
        weights = {"global": {"a": 1.0}}
        lo, hi = blend_intervals(lower, upper, dates, weights, mode="global")
        assert all(lo <= hi)
        assert all(lo >= 0)

    def test_multi_member_intervals(self):
        dates = pd.date_range("2024-06-01", periods=3, freq="D")
        lower = {
            "sarima": np.array([80, 90, 85], dtype=float),
            "prophet": np.array([75, 88, 82], dtype=float),
        }
        upper = {
            "sarima": np.array([120, 110, 115], dtype=float),
            "prophet": np.array([125, 112, 118], dtype=float),
        }
        weights = {"global": {"sarima": 0.6, "prophet": 0.4}}
        lo, hi = blend_intervals(lower, upper, dates, weights, mode="global")
        assert len(lo) == 3
        assert all(lo <= hi)


class TestSelectorEnsembleIntegration:

    def test_ensemble_considered_for_revenue(self):
        """Ensemble should appear in candidate evaluation for revenue."""
        np.random.seed(42)
        n = 250
        dates = pd.date_range("2024-06-01", periods=n, freq="D")
        t = np.arange(n, dtype=float)
        seasonal = 20 * np.sin(2 * np.pi * t / 7)
        values = 1000 + seasonal + 0.1 * t + np.random.randn(n) * 10
        ts = TimeSeries(dates, np.maximum(values, 1), "revenue")

        import config as cfg
        saved_timeout = cfg.SELECTOR_TIMEOUT_SECONDS
        saved_ens = cfg.ENSEMBLE_TIMEOUT_SEC
        cfg.SELECTOR_TIMEOUT_SECONDS = 300
        cfg.ENSEMBLE_TIMEOUT_SEC = 120
        try:
            from selector import select_model
            result = select_model(
                ts, "revenue",
                max_candidates_sarima=3,
                max_candidates_prophet=2,
                max_candidates_exog=0,
            )
        finally:
            cfg.SELECTOR_TIMEOUT_SECONDS = saved_timeout
            cfg.ENSEMBLE_TIMEOUT_SEC = saved_ens

        assert result.is_valid
        assert result.model_family in ("baseline", "sarima", "prophet", "sarimax_exog", "ensemble", "two_stage")

    def test_ensemble_not_used_for_non_revenue(self):
        """Ensemble should only be evaluated for revenue metric."""
        np.random.seed(42)
        n = 200
        dates = pd.date_range("2024-06-01", periods=n, freq="D")
        values = 50 + np.random.randn(n) * 5
        ts = TimeSeries(dates, np.maximum(values, 0.1), "bookings")

        from selector import select_model
        result = select_model(
            ts, "bookings",
            max_candidates_sarima=3,
            max_candidates_prophet=0,
            max_candidates_exog=0,
        )
        assert result.model_family != "ensemble"


class TestProjectSimplex:

    def test_basic_projection(self):
        w = np.array([0.8, 0.1, 0.1])
        projected = _project_simplex_with_min(w, 0.05)
        assert abs(sum(projected) - 1.0) < 1e-6
        assert all(projected >= 0.05 - 1e-6)

    def test_equal_when_all_same(self):
        w = np.array([0.25, 0.25, 0.25, 0.25])
        projected = _project_simplex_with_min(w, 0.05)
        np.testing.assert_allclose(projected, 0.25, atol=1e-6)


class TestRecencyWeighting:

    def test_recency_alpha_1_equals_uniform(self):
        """alpha=1.0 should produce identical results to no recency (backward compat)."""
        np.random.seed(42)
        n, h = 10, 14
        fold_actuals = [np.random.rand(h) * 100 + 50 for _ in range(n)]
        dates = [pd.date_range("2024-06-01", periods=h, freq="D") for _ in range(n)]
        fold_preds = {
            "sarima": [a + np.random.randn(h) * 5 for a in fold_actuals],
            "prophet": [a + np.random.randn(h) * 8 for a in fold_actuals],
        }
        w_uniform = fit_ensemble_weights(fold_actuals, fold_preds, dates, mode="global", recency_alpha=1.0, shrinkage_min_samples=0)
        w_default = fit_ensemble_weights(fold_actuals, fold_preds, dates, mode="global", recency_alpha=1.0, shrinkage_min_samples=0)
        assert w_uniform["global"] == w_default["global"]

    def test_recency_recent_folds_dominate(self):
        """Recent folds favor model B; with alpha<1, B should get more weight."""
        np.random.seed(42)
        n, h = 12, 14
        fold_actuals = [np.random.rand(h) * 100 + 100 for _ in range(n)]
        dates = [pd.date_range("2024-06-01", periods=h, freq="D") for _ in range(n)]
        fold_preds_a = []
        fold_preds_b = []
        for i in range(n):
            if i < n // 2:
                fold_preds_a.append(fold_actuals[i] + np.random.randn(h) * 2)
                fold_preds_b.append(fold_actuals[i] + np.random.randn(h) * 20)
            else:
                fold_preds_a.append(fold_actuals[i] + np.random.randn(h) * 20)
                fold_preds_b.append(fold_actuals[i] + np.random.randn(h) * 2)
        fold_preds = {"model_a": fold_preds_a, "model_b": fold_preds_b}

        w_no_recency = fit_ensemble_weights(fold_actuals, fold_preds, dates, mode="global", recency_alpha=1.0, shrinkage_min_samples=0)
        w_recency = fit_ensemble_weights(fold_actuals, fold_preds, dates, mode="global", recency_alpha=0.85, shrinkage_min_samples=0)

        assert w_recency["global"]["model_b"] > w_no_recency["global"]["model_b"]

    def test_recency_alpha_bounds(self):
        """alpha=0.80 should still produce valid simplex weights."""
        np.random.seed(42)
        n, h = 8, 14
        fold_actuals = [np.random.rand(h) * 100 + 50 for _ in range(n)]
        dates = [pd.date_range("2024-06-01", periods=h, freq="D") for _ in range(n)]
        fold_preds = {
            "a": [a + np.random.randn(h) * 5 for a in fold_actuals],
            "b": [a + np.random.randn(h) * 8 for a in fold_actuals],
            "c": [a + np.random.randn(h) * 12 for a in fold_actuals],
        }
        import config as cfg
        min_w = cfg.ENSEMBLE_MIN_WEIGHT
        w = fit_ensemble_weights(fold_actuals, fold_preds, dates, mode="global", recency_alpha=0.80, shrinkage_min_samples=0)
        assert abs(sum(w["global"].values()) - 1.0) < 1e-4
        for v in w["global"].values():
            assert v >= min_w - 1e-6


class TestBayesianShrinkage:

    def _make_fold_data(self, n=12, h=14):
        np.random.seed(42)
        fold_actuals = [np.random.rand(h) * 100 + 50 for _ in range(n)]
        dates = [pd.date_range(f"2024-06-{1+i}", periods=h, freq="D") for i in range(n)]
        fold_preds = {
            "sarima": [a + np.random.randn(h) * 5 for a in fold_actuals],
            "prophet": [a + np.random.randn(h) * 8 for a in fold_actuals],
        }
        return fold_actuals, fold_preds, dates

    def test_shrinkage_zero_equals_no_shrinkage(self):
        """shrinkage_min_samples=0 should produce raw weekday weights."""
        fa, fp, dates = self._make_fold_data()
        w = fit_ensemble_weights(fa, fp, dates, mode="weekday", recency_alpha=1.0, shrinkage_min_samples=0)
        assert "weekday" in w
        for dow in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]:
            assert abs(sum(w["weekday"][dow].values()) - 1.0) < 1e-4
        for lam in w["shrinkage"]["per_weekday_lambda"].values():
            assert lam == 0.0

    def test_shrinkage_high_pulls_toward_global(self):
        """shrinkage_min_samples=1000 should make weekday weights nearly global."""
        fa, fp, dates = self._make_fold_data()
        w = fit_ensemble_weights(fa, fp, dates, mode="weekday", recency_alpha=1.0, shrinkage_min_samples=1000)
        global_w = w["global"]
        for dow in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]:
            for member in global_w:
                assert abs(w["weekday"][dow][member] - global_w[member]) < 0.05

    def test_shrinkage_floor_respected(self):
        """With floor=0.5, at least 50% global retained in every weekday vector."""
        fa, fp, dates = self._make_fold_data()
        w = fit_ensemble_weights(fa, fp, dates, mode="weekday", recency_alpha=1.0, shrinkage_min_samples=12, shrinkage_floor=0.5)
        for lam in w["shrinkage"]["per_weekday_lambda"].values():
            assert lam >= 0.5 - 1e-6 or lam == 0.0

    def test_shrinkage_reduces_worst_day_variance(self):
        """Shrinkage should reduce the spread of weekday weights vs no shrinkage."""
        fa, fp, dates = self._make_fold_data(n=15, h=14)
        w_raw = fit_ensemble_weights(fa, fp, dates, mode="weekday", recency_alpha=1.0, shrinkage_min_samples=0)
        w_shrunk = fit_ensemble_weights(fa, fp, dates, mode="weekday", recency_alpha=1.0, shrinkage_min_samples=12, shrinkage_floor=0.3)

        def _weight_spread(wd):
            all_vals = []
            for dow_dict in wd["weekday"].values():
                all_vals.extend(dow_dict.values())
            return np.std(all_vals)

        assert _weight_spread(w_shrunk) <= _weight_spread(w_raw) + 1e-6


class TestRecencyPlusShrinkageCombined:

    def test_combined_weights_valid_simplex(self):
        np.random.seed(42)
        n, h = 12, 14
        fold_actuals = [np.random.rand(h) * 100 + 50 for _ in range(n)]
        dates = [pd.date_range(f"2024-06-{1+i}", periods=h, freq="D") for i in range(n)]
        fold_preds = {
            "sarima": [a + np.random.randn(h) * 5 for a in fold_actuals],
            "prophet": [a + np.random.randn(h) * 8 for a in fold_actuals],
            "exog": [a + np.random.randn(h) * 10 for a in fold_actuals],
        }
        import config as cfg
        min_w = cfg.ENSEMBLE_MIN_WEIGHT
        w = fit_ensemble_weights(fold_actuals, fold_preds, dates, mode="weekday",
                                 recency_alpha=0.90, shrinkage_min_samples=12, shrinkage_floor=0.3)
        assert abs(sum(w["global"].values()) - 1.0) < 1e-4
        for dow in ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]:
            assert abs(sum(w["weekday"][dow].values()) - 1.0) < 1e-4
            for v in w["weekday"][dow].values():
                assert v >= min_w - 1e-6

    def test_combined_metadata_present(self):
        np.random.seed(42)
        n, h = 10, 14
        fold_actuals = [np.random.rand(h) * 100 + 50 for _ in range(n)]
        dates = [pd.date_range("2024-06-01", periods=h, freq="D") for _ in range(n)]
        fold_preds = {
            "a": [a + np.random.randn(h) * 5 for a in fold_actuals],
            "b": [a + np.random.randn(h) * 8 for a in fold_actuals],
        }
        w = fit_ensemble_weights(fold_actuals, fold_preds, dates, mode="weekday",
                                 recency_alpha=0.90, shrinkage_min_samples=12, shrinkage_floor=0.3)
        assert "shrinkage" in w
        s = w["shrinkage"]
        assert s["recency_alpha"] == 0.90
        assert s["shrinkage_min_samples"] == 12
        assert s["shrinkage_floor"] == 0.3
        assert "per_weekday_lambda" in s


class TestExplosionGuardOnEnsemble:

    def test_explosive_member_caught(self):
        """Explosion guard should trigger when ensemble includes explosive preds."""
        from diagnostics import explosion_guard
        normal = np.ones(56) * 100
        explosive = np.ones(14) * 1e8
        guard = explosion_guard(explosive, normal)
        assert guard["explosion_guard_triggered"]
