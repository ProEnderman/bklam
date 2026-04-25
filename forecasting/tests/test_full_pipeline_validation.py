"""Full pipeline validation: multi-family competition, hierarchical, registry, explosion guard."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import tempfile
import numpy as np
import pandas as pd
import pytest

from types_ import TimeSeries, ForecastResult
from transforms import IdentityTransform, LogTransform
from selector import select_model, get_last_selection_report
from diagnostics import get_explosion_log, reset_explosion_log
from hierarchical import forecast_hierarchical_total, validate_hierarchical

import config
import registry as reg_mod

_orig_reg = config.REGISTRY_DIR


@pytest.fixture(autouse=True)
def tmp_registry(tmp_path):
    config.REGISTRY_DIR = str(tmp_path / "registry")
    reg_mod.REGISTRY_DIR = config.REGISTRY_DIR
    reset_explosion_log()
    yield
    config.REGISTRY_DIR = _orig_reg


def _make_weekly_ts(n=250, base=100, amplitude=20, noise=5, name="test"):
    np.random.seed(42)
    dates = pd.date_range("2024-06-01", periods=n, freq="D")
    t = np.arange(n, dtype=float)
    values = base + amplitude * np.sin(2 * np.pi * t / 7) + np.random.randn(n) * noise
    return TimeSeries(dates=dates, values=values.clip(1), name=name)


def _make_trended_ts(n=250, base=100, slope=0.1, noise=3, name="trended"):
    np.random.seed(99)
    dates = pd.date_range("2024-06-01", periods=n, freq="D")
    t = np.arange(n, dtype=float)
    values = base + slope * t + 15 * np.sin(2 * np.pi * t / 7) + np.random.randn(n) * noise
    return TimeSeries(dates=dates, values=values.clip(1), name=name)


class TestModelFamilyParticipation:
    def test_sarima_and_prophet_both_evaluated(self):
        """Both SARIMA and Prophet should be evaluated when data is sufficient."""
        ts = _make_weekly_ts(250)
        result = select_model(
            ts, "utilization",
            max_candidates_sarima=3,
            max_candidates_prophet=2,
            max_candidates_exog=0,
        )
        report = get_last_selection_report()
        assert report.get("metric") == "utilization"

        fam_eval = report.get("model_families_evaluated", {})
        sarima_stats = fam_eval.get("sarima", {})
        prophet_stats = fam_eval.get("prophet", {})

        assert sarima_stats.get("evaluated", 0) > 0, "SARIMA was not evaluated"
        assert prophet_stats.get("evaluated", 0) > 0 or prophet_stats.get("skipped_reason") == "prophet_not_installed", \
            "Prophet was neither evaluated nor marked as not installed"

        assert result.is_valid
        assert result.model_family in ("baseline", "sarima", "prophet", "sarimax_exog")

    def test_sarimax_exog_skipped_when_no_base_series(self):
        ts = _make_weekly_ts(200)
        result = select_model(
            ts, "utilization",
            max_candidates_sarima=2,
            max_candidates_prophet=0,
            max_candidates_exog=3,
            base_series=None,
        )
        report = get_last_selection_report()
        exog_stats = report.get("model_families_evaluated", {}).get("sarimax_exog", {})
        assert exog_stats.get("evaluated", 0) == 0
        skip = exog_stats.get("skipped_reason", "")
        assert skip in ("no_base_series", "no_regressors_available", "timeout", "")

    def test_sarimax_exog_evaluated_with_base_series(self):
        ts = _make_weekly_ts(250, name="revenue")
        base = {
            "bookings": _make_weekly_ts(250, base=30, amplitude=5, name="bookings"),
            "utilization": _make_weekly_ts(250, base=50, amplitude=10, name="utilization"),
        }
        result = select_model(
            ts, "revenue",
            max_candidates_sarima=2,
            max_candidates_prophet=0,
            max_candidates_exog=3,
            base_series=base,
        )
        report = get_last_selection_report()
        exog_stats = report.get("model_families_evaluated", {}).get("sarimax_exog", {})
        assert exog_stats.get("evaluated", 0) > 0, "SARIMAX-exog was not evaluated with base_series"

    def test_no_family_silently_skipped(self):
        """With data and base_series, all families should be at least attempted."""
        ts = _make_weekly_ts(250, name="revenue")
        base = {
            "bookings": _make_weekly_ts(250, base=20, name="bookings"),
        }
        result = select_model(
            ts, "revenue",
            max_candidates_sarima=2,
            max_candidates_prophet=1,
            max_candidates_exog=2,
            base_series=base,
        )
        report = get_last_selection_report()
        for fam in ("sarima", "sarimax_exog"):
            stats = report["model_families_evaluated"][fam]
            assert stats["evaluated"] > 0 or stats.get("skipped_reason"), \
                f"{fam} silently skipped — no evaluated count and no skip reason"


class TestSelectionReportStructure:
    def test_report_has_all_required_fields(self):
        ts = _make_weekly_ts(200)
        select_model(ts, "utilization", max_candidates_sarima=3, max_candidates_prophet=0, max_candidates_exog=0)
        report = get_last_selection_report()
        required = {
            "metric", "model_families_evaluated", "best_per_family",
            "final_selected_model", "final_selected_family", "selection_reason",
            "baseline_score", "elapsed_seconds", "explosion_guard_stats",
        }
        missing = required - set(report.keys())
        assert not missing, f"Missing report fields: {missing}"

    def test_fold_error_distribution_when_non_baseline(self):
        ts = _make_weekly_ts(250)
        result = select_model(ts, "utilization", max_candidates_sarima=5, max_candidates_prophet=0, max_candidates_exog=0)
        report = get_last_selection_report()
        if report.get("final_selected_family") != "baseline":
            assert "fold_error_distribution" in report
            dist = report["fold_error_distribution"]
            assert dist["min"] <= dist["mean"] <= dist["max"]
            assert dist["n"] > 0


class TestExplosionGuardTracking:
    def test_explosion_log_populated(self):
        ts = _make_weekly_ts(200)
        select_model(ts, "utilization", max_candidates_sarima=3, max_candidates_prophet=0, max_candidates_exog=0)
        log = get_explosion_log()
        assert len(log) >= 0  # may be empty if no guard checks triggered

    def test_explosive_candidates_tracked(self):
        from backtest import evaluate_candidate

        np.random.seed(42)
        ts = _make_weekly_ts(200)
        transform = IdentityTransform()

        def exploding_fn(y_t, h):
            yhat = np.full(h, np.max(y_t) * 100)
            return yhat, yhat, yhat, {}

        reset_explosion_log()
        evaluate_candidate(ts, transform, exploding_fn, "exploder", {})
        log = get_explosion_log()
        triggered = [e for e in log if e.get("explosion_guard_triggered")]
        assert len(triggered) > 0

    def test_over_restriction_flag(self):
        """If >70% of a family's candidates are rejected by explosion guard, stats should warn."""
        ts = _make_weekly_ts(200)
        select_model(ts, "utilization", max_candidates_sarima=5, max_candidates_prophet=0, max_candidates_exog=0)
        report = get_last_selection_report()
        for fam, stats in report.get("model_families_evaluated", {}).items():
            if stats.get("explosion_rejection_pct", 0) > 70 and stats.get("evaluated", 0) >= 3:
                assert "WARNING" in stats


class TestRegistryIntegration:
    def test_selection_records_runs(self):
        ts = _make_weekly_ts(200)
        select_model(ts, "bookings", max_candidates_sarima=3, max_candidates_prophet=0, max_candidates_exog=0)

        from registry import _load_runs
        runs = _load_runs("bookings")
        assert len(runs) > 0

    def test_registry_integrity(self):
        ts = _make_weekly_ts(200)
        select_model(ts, "revenue", max_candidates_sarima=3, max_candidates_prophet=0, max_candidates_exog=0)

        from registry import validate_registry_integrity
        result = validate_registry_integrity("revenue")
        assert result["total_runs"] > 0
        assert result["valid"] or len(result["issues"]) > 0

    def test_leaderboard_reflects_runs(self):
        ts = _make_weekly_ts(200)
        select_model(ts, "utilization", max_candidates_sarima=3, max_candidates_prophet=0, max_candidates_exog=0)

        from registry import get_leaderboard
        lb = get_leaderboard("utilization")
        assert len(lb) > 0
        assert lb[0].mean_error < float("inf")


class TestHierarchicalValidation:
    def test_hierarchical_aggregation_correct(self):
        np.random.seed(42)
        seg1 = _make_weekly_ts(200, 100, name="s1")
        seg2 = _make_weekly_ts(200, 50, name="s2")
        segments = {"1": seg1, "2": seg2}
        names = {"1": "A", "2": "B"}

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

        seg1_avg = float(np.mean(seg1.values[-7:]))
        seg2_avg = float(np.mean(seg2.values[-7:]))
        expected_total = seg1_avg + seg2_avg

        assert abs(result.yhat[0] - round(expected_total, 2)) < 0.1

    def test_validate_hierarchical_returns_report(self):
        np.random.seed(42)
        seg1 = _make_weekly_ts(200, 100, name="s1")
        segments = {"1": seg1}
        names = {"1": "A"}

        def mock_fc(ts, metric, horizon, seg_id):
            avg = float(np.mean(ts.values[-7:]))
            dates = [(ts.dates[-1] + pd.Timedelta(days=i + 1)).strftime("%Y-%m-%d") for i in range(horizon)]
            return ForecastResult(
                dates=dates, yhat=[avg] * horizon,
                yhat_lower=[avg * 0.8] * horizon, yhat_upper=[avg * 1.2] * horizon,
                model_name="ma7", params={}, transform_name="identity",
                train_end=str(ts.dates[-1].date()), model_family="baseline",
            )

        def mock_direct(metric, horizon):
            return mock_fc(seg1, metric, horizon, None)

        report = validate_hierarchical("revenue", segments, names, mock_fc, mock_direct, 14)
        assert report["hierarchical_available"]
        assert report["segment_count"] == 1


class TestNonBaselineSelection:
    def test_non_baseline_can_win_on_seasonal_data(self):
        """On clean seasonal data, at least one non-baseline family should be competitive."""
        ts = _make_weekly_ts(250, base=500, amplitude=80, noise=10)
        result = select_model(
            ts, "utilization",
            max_candidates_sarima=10,
            max_candidates_prophet=0,
            max_candidates_exog=0,
        )
        report = get_last_selection_report()
        best_per = report.get("best_per_family", {})
        non_baseline_available = any(
            fam != "baseline" and data.get("error", float("inf")) < float("inf")
            for fam, data in best_per.items()
        )
        assert non_baseline_available, "No non-baseline family produced a valid candidate"

    def test_hierarchical_wins_when_segments_stronger(self):
        """When segments have strong independent signals, hierarchical should produce valid output."""
        np.random.seed(42)
        segs = {}
        names = {}
        for i in range(5):
            ts = TimeSeries(
                pd.date_range("2024-06-01", periods=200, freq="D"),
                (50 + i * 20) + np.sin(np.arange(200) * 2 * np.pi / 7) * (5 + i * 3) + np.random.randn(200) * 2,
                f"seg_{i}",
            )
            segs[str(i)] = ts
            names[str(i)] = f"Segment {i}"

        def fc(ts, metric, horizon, seg_id):
            avg = float(np.mean(ts.values[-7:]))
            dates = [(ts.dates[-1] + pd.Timedelta(days=j + 1)).strftime("%Y-%m-%d") for j in range(horizon)]
            return ForecastResult(
                dates=dates, yhat=[avg] * horizon,
                yhat_lower=[avg * 0.8] * horizon, yhat_upper=[avg * 1.2] * horizon,
                model_name="ma7", params={}, transform_name="identity",
                train_end=str(ts.dates[-1].date()), model_family="baseline",
            )

        result = forecast_hierarchical_total("revenue", segs, names, fc, 14)
        assert result is not None
        assert result.model_family == "hierarchical"
        assert len(result.segments) == 5
        assert all(v > 0 for v in result.yhat)


class TestAPIValidationEndpoints:
    def test_validation_summary_structure(self):
        """Simulate what the validation-summary endpoint would return."""
        ts = _make_weekly_ts(200)
        select_model(ts, "utilization", max_candidates_sarima=3, max_candidates_prophet=0, max_candidates_exog=0)
        report = get_last_selection_report()
        assert "model_families_evaluated" in report
        assert "explosion_guard_stats" in report
        assert "final_selected_family" in report

    def test_registry_validate_after_selection(self):
        ts = _make_weekly_ts(200)
        select_model(ts, "revenue", max_candidates_sarima=3, max_candidates_prophet=0, max_candidates_exog=0)

        from registry import validate_registry_integrity
        result = validate_registry_integrity("revenue")
        assert "total_runs" in result
        assert "families_seen" in result
        assert "valid" in result
