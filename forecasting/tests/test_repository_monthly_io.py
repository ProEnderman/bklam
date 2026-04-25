"""Tests for monthly rollup persistence in repository."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import json
import tempfile
import pytest
import pandas as pd

from aggregation import MonthlyRollupResult
import repository


class TestMonthlyRollupPersistence:
    """save_monthly_rollup / load_monthly_rollup round-trip."""

    def setup_method(self):
        self._tmpdir = tempfile.mkdtemp()
        repository._MONTHLY_DIR = os.path.join(self._tmpdir, "monthly")

    def _make_rollup(self, metric="revenue", year=2026, month=1) -> MonthlyRollupResult:
        return MonthlyRollupResult(
            metric=metric, year=year, month=month,
            period_start=f"{year}-{month:02d}-01",
            period_end=f"{year}-{month:02d}-28",
            status="full", covered_days=28, total_days=28,
            coverage_ratio=1.0,
            predicted_total=123456.78,
            lower_total=110000.0,
            upper_total=140000.0,
            model_family_used="ensemble_weekday",
            last_updated_timestamp="2026-01-30T12:00:00",
            notes={"aggregation": "calendar_month"},
        )

    def test_save_load_roundtrip(self):
        rollup = self._make_rollup()
        repository.save_monthly_rollup(rollup)
        loaded = repository.load_monthly_rollup("revenue", 2026, 1)
        assert loaded is not None
        assert loaded["metric"] == "revenue"
        assert loaded["predicted_total"] == pytest.approx(123456.78, abs=0.01)
        assert loaded["status"] == "full"

    def test_load_missing_returns_none(self):
        assert repository.load_monthly_rollup("revenue", 1999, 1) is None

    def test_list_rollups(self):
        repository.save_monthly_rollup(self._make_rollup(month=1))
        repository.save_monthly_rollup(self._make_rollup(month=2))
        repository.save_monthly_rollup(self._make_rollup(month=3))
        result = repository.list_monthly_rollups("revenue", limit=10)
        assert len(result) == 3

    def test_list_respects_limit(self):
        for m in range(1, 7):
            repository.save_monthly_rollup(self._make_rollup(month=m))
        result = repository.list_monthly_rollups("revenue", limit=3)
        assert len(result) == 3


class TestMonthIsClosed:
    def test_past_month(self):
        assert repository.month_is_closed(2025, 6, pd.Timestamp("2025-07-01", tz="Europe/Zurich"))

    def test_current_month(self):
        assert not repository.month_is_closed(2026, 2, pd.Timestamp("2026-02-15", tz="Europe/Zurich"))

    def test_boundary(self):
        assert repository.month_is_closed(2025, 12, pd.Timestamp("2026-01-01", tz="Europe/Zurich"))

    def test_december_edge(self):
        assert not repository.month_is_closed(2025, 12, pd.Timestamp("2025-12-31", tz="Europe/Zurich"))

    def test_naive_timestamp_gets_localized(self):
        assert repository.month_is_closed(2025, 6, pd.Timestamp("2025-07-02"))
