"""Tests for holiday and event providers."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from datetime import date

import numpy as np
import pandas as pd
import pytest

from holidays import HolidayProvider, build_holiday_flags, merge_prophet_holidays


class TestHolidayProvider:
    def test_returns_dataframe(self):
        hp = HolidayProvider("CH")
        df = hp.holidays_df(date(2025, 1, 1), date(2025, 12, 31))
        assert isinstance(df, pd.DataFrame)
        assert "ds" in df.columns or df.empty
        assert "holiday" in df.columns or df.empty

    def test_deterministic(self):
        hp = HolidayProvider("CH")
        df1 = hp.holidays_df(date(2025, 1, 1), date(2025, 3, 31))
        df2 = hp.holidays_df(date(2025, 1, 1), date(2025, 3, 31))
        if not df1.empty:
            assert len(df1) == len(df2)


class TestBuildHolidayFlags:
    def test_flag_shape(self):
        dates = pd.date_range("2025-01-01", periods=30, freq="D")
        hdf = pd.DataFrame({"ds": [pd.Timestamp("2025-01-01"), pd.Timestamp("2025-01-02")],
                            "holiday": ["NY", "NY2"]})
        edf = pd.DataFrame(columns=["ds", "event_name"])
        flags = build_holiday_flags(dates, hdf, edf)
        assert len(flags) == 30
        assert "is_holiday" in flags.columns
        assert "is_event" in flags.columns
        assert flags["is_holiday"].iloc[0] == 1.0

    def test_empty_inputs(self):
        dates = pd.date_range("2025-01-01", periods=10, freq="D")
        flags = build_holiday_flags(
            dates, pd.DataFrame(columns=["ds", "holiday"]),
            pd.DataFrame(columns=["ds", "event_name"]),
        )
        assert len(flags) == 10
        assert flags["is_holiday"].sum() == 0


class TestMergeProphetHolidays:
    def test_merge(self):
        hdf = pd.DataFrame({"ds": [pd.Timestamp("2025-01-01")], "holiday": ["NY"]})
        edf = pd.DataFrame({"ds": [pd.Timestamp("2025-06-15")], "event_name": ["Summer"]})
        merged = merge_prophet_holidays(hdf, edf)
        assert len(merged) == 2
        assert "ds" in merged.columns
        assert "holiday" in merged.columns

    def test_empty_merge(self):
        merged = merge_prophet_holidays(
            pd.DataFrame(columns=["ds", "holiday"]),
            pd.DataFrame(columns=["ds", "event_name"]),
        )
        assert len(merged) == 0
