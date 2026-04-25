"""Tests: no header in any sheet contains 'Unnamed'."""

import sys, os, types, datetime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest


_dates = pd.date_range("2025-01-01", periods=60, freq="D")
_rev = np.random.default_rng(0).uniform(3000, 8000, 60)
_bk = np.random.default_rng(1).integers(10, 50, 60).astype(float)


class _TS:
    def __init__(self, d, v): self.dates, self.values = d, v


class _FC:
    def __init__(self):
        self.dates = pd.date_range("2025-03-01", periods=30, freq="D")
        self.yhat = np.random.default_rng(2).uniform(3000, 7000, 30)
        self.yhat_lower = self.yhat * 0.85
        self.yhat_upper = self.yhat * 1.15
        self.model_family = self.model_name = "prophet"
        self.created_at = "2025-02-28"


class _LB:
    def __init__(self, e): self.mean_error = e


_spec = {"model_family": "prophet", "transform_name": "log",
         "diagnostics": {"n_folds": 3}, "trained_at": "2025-02-28T10:00:00", "warnings": []}


def _stubs():
    c = types.ModuleType("config")
    c.METRICS = ["revenue", "bookings", "cancel_rate", "utilization", "avg_check"]
    c.DEFAULT_HORIZON_DAYS = 14; c.DATABASE_URL = "sqlite://"
    c.METRIC_OPTIMIZATION = {"revenue": "smape", "bookings": "smape",
                             "cancel_rate": "mae", "utilization": "mae", "avg_check": "smape"}
    r = types.ModuleType("repository")
    r.load_metric = lambda m: _TS(_dates, _rev if m == "revenue" else _bk)
    r.load_latest_forecast = lambda m: _FC() if m in ("revenue", "bookings") else None
    r.load_spec = lambda m: _spec
    r.load_daily_revenue_by_activity = lambda since=None: {1: _TS(_dates, _rev)}
    r.load_daily_bookings_by_activity = lambda since=None: {1: _TS(_dates, _bk)}
    r.list_segments = lambda: [{"id": 1, "name": "Bowling"}]
    r.list_monthly_rollups = lambda m, limit=24: []
    r.load_actual_monthly = lambda m, y, mo: None
    r.month_is_closed = lambda y, mo, now=None: False
    r.load_monthly_rollup = lambda m, y, mo: None
    g = types.ModuleType("registry")
    g.get_leaderboard = lambda m: [_LB(0.05)]
    g.get_monthly_accuracy = lambda m, limit=24: []
    g._load_runs = lambda m: [{"metric": m, "model": "prophet"}]
    g.record_run = lambda *a, **kw: None
    return {"config": c, "repository": r, "registry": g}


from excel_exporter import build_workbook


@pytest.fixture(scope="module")
def wb():
    s = _stubs()
    saved = {n: sys.modules.get(n) for n in s}
    for n, m in s.items():
        sys.modules[n] = m
    try:
        from excel_exporter import collect_export_datasets
        ds, meta = collect_export_datasets(
            date_from=datetime.date(2025, 1, 1),
            date_to=datetime.date(2025, 3, 1), year=2025, month=2)
        return build_workbook(ds, meta, write_only=False)
    finally:
        for n, orig in saved.items():
            if orig is not None:
                sys.modules[n] = orig
            else:
                sys.modules.pop(n, None)


def test_no_unnamed_in_any_sheet(wb):
    for sn in wb.sheetnames:
        ws = wb[sn]
        for row in ws.iter_rows(min_row=1, max_row=1):
            for cell in row:
                val = str(cell.value) if cell.value is not None else ""
                assert not val.startswith("Unnamed"), (
                    f"Unnamed header '{val}' in sheet '{sn}'"
                )
