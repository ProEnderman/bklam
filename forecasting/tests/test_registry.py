"""Tests for model registry and leaderboard."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import tempfile
import pytest

from types_ import RegistryRun, LeaderboardEntry

# Patch REGISTRY_DIR for isolation
import config
_orig_dir = config.REGISTRY_DIR


@pytest.fixture(autouse=True)
def tmp_registry(tmp_path):
    config.REGISTRY_DIR = str(tmp_path / "registry")
    import registry
    registry.REGISTRY_DIR = config.REGISTRY_DIR
    yield
    config.REGISTRY_DIR = _orig_dir


class TestRegistry:
    def test_record_and_leaderboard(self):
        from registry import record_run, get_leaderboard

        run1 = RegistryRun(metric_name="revenue", model_family="sarima",
                           params={"order": [1, 0, 1]}, transform_name="log",
                           mean_error=0.15, fold_errors=[0.14, 0.16])
        run2 = RegistryRun(metric_name="revenue", model_family="prophet",
                           params={"cps": 0.1}, transform_name="log",
                           mean_error=0.12, fold_errors=[0.11, 0.13])
        record_run(run1)
        record_run(run2)

        lb = get_leaderboard("revenue")
        assert len(lb) == 2
        assert lb[0].mean_error <= lb[1].mean_error

    def test_leaderboard_top_k(self):
        from registry import record_run, get_leaderboard

        for i in range(10):
            record_run(RegistryRun(
                metric_name="bookings", model_family=f"model_{i}",
                params={}, transform_name="identity",
                mean_error=0.5 - i * 0.04, fold_errors=[],
            ))
        lb = get_leaderboard("bookings", top_k=3)
        assert len(lb) <= 3

    def test_prune(self):
        from registry import record_run, prune_old_runs, _load_runs
        import registry
        registry.REGISTRY_MAX_RUNS_PER_METRIC = 5

        for i in range(10):
            record_run(RegistryRun(
                metric_name="util", model_family="sarima",
                params={"i": i}, transform_name="identity",
                mean_error=float(i),
            ))

        prune_old_runs("util")
        runs = _load_runs("util")
        assert len(runs) <= 5
        registry.REGISTRY_MAX_RUNS_PER_METRIC = 50

    def test_empty_leaderboard(self):
        from registry import get_leaderboard
        lb = get_leaderboard("nonexistent_metric")
        assert lb == []

    def test_leaderboard_entry_dict(self):
        e = LeaderboardEntry(
            model_family="sarima", params={"order": [1, 0, 1]},
            transform_name="log", mean_error=0.15,
            metric_name="revenue",
        )
        d = e.to_dict()
        assert "model_family" in d
        assert "mean_error" in d
