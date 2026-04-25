"""Tests: every legacy dataset is preserved (mapped or in 97_Extra_*)."""

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


from excel_exporter import build_workbook, LEGACY_MAP, _INTERNAL_KEYS


@pytest.fixture(scope="module")
def ds_and_wb():
    s = _stubs()
    saved = {n: sys.modules.get(n) for n in s}
    for n, m in s.items():
        sys.modules[n] = m
    try:
        from excel_exporter import collect_export_datasets
        ds, meta = collect_export_datasets(
            date_from=datetime.date(2025, 1, 1),
            date_to=datetime.date(2025, 3, 1), year=2025, month=2)
        wb = build_workbook(ds, meta, write_only=False)
        return ds, wb
    finally:
        for n, orig in saved.items():
            if orig is not None:
                sys.modules[n] = orig
            else:
                sys.modules.pop(n, None)


def test_every_dataset_has_a_sheet(ds_and_wb):
    ds, wb = ds_and_wb
    sheet_names = set(wb.sheetnames)
    mapped_targets = set(LEGACY_MAP.values())

    for key in ds:
        if key in _INTERNAL_KEYS or key.startswith("_"):
            continue
        target = LEGACY_MAP.get(key)
        if target:
            assert target in sheet_names, (
                f"Dataset '{key}' mapped to '{target}' but sheet missing"
            )
        else:
            extras = [s for s in sheet_names if s.startswith("97_Extra_")]
            found = any(key in e for e in extras)
            assert found, (
                f"Dataset '{key}' not in LEGACY_MAP and no 97_Extra_ sheet for it"
            )


def test_no_dataset_dropped(ds_and_wb):
    ds, _ = ds_and_wb
    public_keys = {k for k in ds if not k.startswith("_")}
    mapped_keys = set(LEGACY_MAP.keys())
    unmapped = public_keys - mapped_keys
    for k in unmapped:
        assert isinstance(ds[k], pd.DataFrame), f"Dataset '{k}' is not a DataFrame"


def test_raw_daily_present_and_nonempty(ds_and_wb):
    ds, wb = ds_and_wb
    assert "95_Daily_Data" in wb.sheetnames
    ws = wb["95_Daily_Data"]
    rows = list(ws.iter_rows(max_row=3, values_only=True))
    assert len(rows) >= 2


def test_metadata_has_required_keys(ds_and_wb):
    _, wb = ds_and_wb
    ws = wb["99_Metadata"]
    keys = set()
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[0]:
            keys.add(row[0])
    for k in ("report_generated_at", "date_from", "date_to",
              "currency", "export_version", "confidence_level"):
        assert k in keys, f"Missing metadata key '{k}'"


def test_all_empty_still_valid():
    from excel_exporter import workbook_to_bytes
    ds: dict = {}
    meta = {
        "report_generated_at": "2025-01-01T00:00:00",
        "report_timezone": "UTC", "date_from": "2025-01-01",
        "date_to": "2025-02-01", "currency": "CHF",
        "restaurant_id": "test", "export_version": "4.0.0",
        "forecast_horizon_days": "14", "confidence_level": "0.80",
        "data_freshness_note": "test",
    }
    wb = build_workbook(ds, meta, write_only=True)
    data = workbook_to_bytes(wb)
    assert data[:4] == b"PK\x03\x04"
