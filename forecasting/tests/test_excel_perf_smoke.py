"""Tests: export performance (gated by PERF_TEST=1)."""

import os, sys, time, types
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest

_PERF = os.environ.get("PERF_TEST", "0") == "1"

_cfg = types.ModuleType("config")
_cfg.METRICS = ["revenue", "bookings", "cancel_rate", "utilization", "avg_check"]
_cfg.DEFAULT_HORIZON_DAYS = 14; _cfg.DATABASE_URL = "sqlite://"
_cfg.METRIC_OPTIMIZATION = {"revenue": "smape", "bookings": "smape",
                            "cancel_rate": "mae", "utilization": "mae", "avg_check": "smape"}
sys.modules.setdefault("config", _cfg)

from excel_exporter import build_workbook, workbook_to_bytes, _no_data_df


def _make_datasets(n_daily=10000):
    rng = np.random.default_rng(42)
    dates = pd.date_range("2024-01-01", periods=n_daily, freq="D")
    daily = pd.DataFrame({
        "date": dates.strftime("%Y-%m-%d"),
        "revenue": rng.uniform(2000, 9000, n_daily),
        "bookings": rng.integers(5, 60, n_daily).astype(float),
        "cancel_rate": rng.uniform(0, 0.3, n_daily),
        "utilization": rng.uniform(40, 95, n_daily),
        "avg_check": rng.uniform(30, 120, n_daily),
    })
    rev = daily.rename(columns={"date": "Date", "revenue": "Revenue"}).copy()
    rev["Revenue 7D Avg"] = rev["Revenue"].rolling(7, min_periods=1).mean()
    rev["Revenue vs Prev Week %"] = rev["Revenue"].pct_change(7)

    bk = daily.rename(columns={"date": "Date", "bookings": "Bookings"}).copy()
    bk["Bookings 7D Avg"] = bk["Bookings"].rolling(7, min_periods=1).mean()
    bk["Bookings vs Prev Week %"] = bk["Bookings"].pct_change(7)

    ds = {
        "overview": pd.DataFrame([{
            "Period From": "2024-01-01", "Period To": "2025-12-31",
            "Revenue Total": 1e6, "Bookings Total": 5000, "Avg Check": 200,
            "Cancel Rate %": 0.08, "Utilization %": 0.72,
            "Revenue vs Prev Period %": 0.05, "Bookings vs Prev Period %": 0.03,
            "Top Activity (by Revenue)": "Bowling",
            "Biggest Growth Area (MoM Revenue)": None,
            "Forecast Month (YYYY-MM)": "2025-03",
            "Forecast Revenue (Month Total)": 90000,
            "Forecast Revenue CI Low": 80000, "Forecast Revenue CI High": 100000,
            "Forecast Bookings (Month Total)": 450,
            "Forecast Bookings CI Low": 400, "Forecast Bookings CI High": 500,
            "Model Family Used (Revenue)": "prophet", "Notes": "",
        }]),
        "monthly_performance": pd.DataFrame([{
            "Month": "2024-01", "Revenue": 80000, "Bookings": 400,
            "Avg Check": 200, "MoM Growth %": None,
            "Utilization %": 0.70, "Cancel Rate %": 0.08,
        }]),
        "forecast_summary": pd.DataFrame([{
            "Forecast Month (YYYY-MM)": "2025-03",
            "Forecast Revenue (Total)": 90000,
            "Forecast Revenue CI Low": 80000, "Forecast Revenue CI High": 100000,
            "Forecast Bookings (Total)": 450,
            "Forecast Bookings CI Low": 400, "Forecast Bookings CI High": 500,
            "Forecast Cancel Rate % (Avg)": 0.08,
            "Forecast Utilization % (Avg)": 0.72,
            "Forecast Avg Check (Avg / Weighted)": 200,
            "Model Family Used (Revenue)": "prophet",
            "Confidence Level": 0.80, "Last Updated At (ISO)": "2025-02-28",
            "Coverage Status": "full", "Coverage Ratio": 1.0,
            "Historical Avg Revenue (Same Month)": 85000,
            "Forecast vs Historical Avg %": 0.06,
        }]),
        "risks": pd.DataFrame([{"Type": "Info", "Severity": 0,
                                 "Title": "No risks detected",
                                 "Metric Evidence": "", "Evidence Value": "",
                                 "Recommended Action": ""}]),
        "revenue_analysis": rev,
        "bookings_analysis": bk,
        "customers_overview": _no_data_df(),
        "utilization": daily.rename(columns={"date": "Date", "utilization": "Utilization %"})[["Date", "Utilization %"]].copy(),
        "unit_economics": pd.DataFrame([{"Activity": "Bowling", "Revenue": 5e5,
                                          "Bookings": 2500, "Avg Check": 200,
                                          "RevPAH": None, "Utilization %": None,
                                          "Cancel Rate %": None}]),
        "raw_forecasts_daily": pd.DataFrame({
            "metric": ["revenue"] * 30,
            "date": pd.date_range("2025-03-01", periods=30).strftime("%Y-%m-%d"),
            "yhat": np.random.default_rng(2).uniform(3000, 7000, 30),
            "yhat_lower": np.random.default_rng(3).uniform(2500, 4000, 30),
            "yhat_upper": np.random.default_rng(4).uniform(6000, 9000, 30),
            "model_family": "prophet", "generated_at": "2025-02-28",
            "confidence_level": 0.80,
        }),
        "fact_vs_forecast": _no_data_df(),
        "model_info": pd.DataFrame([{
            "metric": "revenue", "selected_model_family": "prophet",
            "transform": "log", "folds": 3, "horizon_days": 14,
            "backtest_metric": "smape", "backtest_score": 0.05,
            "residual_test": None, "guardrails": "yes", "notes": "",
        }]),
        "backtest_summary": pd.DataFrame([{
            "metric": "revenue", "model_family": "prophet",
            "folds": 3, "horizon_days": 14, "mean_score": 0.05,
            "std_score": None, "min_score": None, "max_score": None,
            "selected": True,
        }]),
        "raw_daily": daily,
        "raw_hourly": _no_data_df(),
        "raw_customers": _no_data_df(),
    }
    meta = {
        "report_generated_at": "2025-03-01T10:00:00",
        "report_timezone": "Europe/Zurich",
        "date_from": "2024-01-01", "date_to": "2025-12-31",
        "currency": "CHF", "restaurant_id": "all",
        "export_version": "4.0.0", "forecast_horizon_days": "14",
        "confidence_level": "0.80", "data_freshness_note": "test",
    }
    return ds, meta


@pytest.mark.skipif(not _PERF, reason="PERF_TEST=1 not set")
def test_typical_under_3_seconds():
    ds, meta = _make_datasets(10000)
    t0 = time.perf_counter()
    wb = build_workbook(ds, meta, write_only=True)
    _ = workbook_to_bytes(wb)
    assert time.perf_counter() - t0 < 3.0


@pytest.mark.skipif(not _PERF, reason="PERF_TEST=1 not set")
def test_stress_50k_under_10_seconds():
    ds, meta = _make_datasets(50000)
    t0 = time.perf_counter()
    wb = build_workbook(ds, meta, write_only=True)
    _ = workbook_to_bytes(wb)
    assert time.perf_counter() - t0 < 10.0


def test_smoke_1k():
    ds, meta = _make_datasets(1000)
    t0 = time.perf_counter()
    wb = build_workbook(ds, meta, write_only=True)
    _ = workbook_to_bytes(wb)
    assert time.perf_counter() - t0 < 5.0
