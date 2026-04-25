"""Tests: 4-layer sheet structure, column schemas, ordering, freeze panes."""

import sys, os, types, datetime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest

# ── Stub factory (never injected at module level) ────────────────

_dates = pd.date_range("2025-01-01", periods=60, freq="D")
_rev = np.random.default_rng(0).uniform(3000, 8000, 60)
_bk = np.random.default_rng(1).integers(10, 50, 60).astype(float)


class _TS:
    def __init__(self, dates, values):
        self.dates, self.values = dates, values


class _FC:
    def __init__(self):
        self.dates = pd.date_range("2025-03-01", periods=30, freq="D")
        self.yhat = np.random.default_rng(2).uniform(3000, 7000, 30)
        self.yhat_lower = self.yhat * 0.85
        self.yhat_upper = self.yhat * 1.15
        self.model_family = "prophet"
        self.model_name = "prophet"
        self.created_at = "2025-02-28"


class _LB:
    def __init__(self, err):
        self.mean_error = err


_spec = {
    "model_family": "prophet", "transform_name": "log",
    "diagnostics": {"n_folds": 3}, "trained_at": "2025-02-28T10:00:00",
    "warnings": [],
}


def _make_stubs():
    cfg = types.ModuleType("config")
    cfg.METRICS = ["revenue", "bookings", "cancel_rate", "utilization", "avg_check"]
    cfg.DEFAULT_HORIZON_DAYS = 14
    cfg.DATABASE_URL = "sqlite://"
    cfg.METRIC_OPTIMIZATION = {
        "revenue": "smape", "bookings": "smape",
        "cancel_rate": "mae", "utilization": "mae", "avg_check": "smape",
    }
    repo = types.ModuleType("repository")
    repo.load_metric = lambda m: _TS(_dates, _rev if m == "revenue" else _bk)
    repo.load_latest_forecast = lambda m: _FC() if m in ("revenue", "bookings") else None
    repo.load_spec = lambda m: _spec
    repo.load_daily_revenue_by_activity = lambda since=None: {1: _TS(_dates, _rev)}
    repo.load_daily_bookings_by_activity = lambda since=None: {1: _TS(_dates, _bk)}
    repo.list_segments = lambda: [{"id": 1, "name": "Bowling"}]
    repo.list_monthly_rollups = lambda m, limit=24: []
    repo.load_actual_monthly = lambda m, y, mo: None
    repo.month_is_closed = lambda y, mo, now=None: False
    repo.load_monthly_rollup = lambda m, y, mo: None
    reg = types.ModuleType("registry")
    reg.get_leaderboard = lambda m: [_LB(0.05)]
    reg.get_monthly_accuracy = lambda m, limit=24: []
    reg._load_runs = lambda m: [{"metric": m, "model": "prophet"}]
    reg.record_run = lambda *a, **kw: None
    return {"config": cfg, "repository": repo, "registry": reg}


from excel_exporter import (
    build_workbook, workbook_to_bytes, sanitize_dataframe,
    ensure_no_unnamed, SHEET_ORDER_FIXED,
)


@pytest.fixture(scope="module")
def wb_and_ds():
    stubs = _make_stubs()
    saved = {n: sys.modules.get(n) for n in stubs}
    for n, m in stubs.items():
        sys.modules[n] = m
    try:
        from excel_exporter import collect_export_datasets
        ds, meta = collect_export_datasets(
            date_from=datetime.date(2025, 1, 1),
            date_to=datetime.date(2025, 3, 1),
            year=2025, month=2,
        )
        wb = build_workbook(ds, meta, write_only=False)
        return wb, ds, meta
    finally:
        for n, orig in saved.items():
            if orig is not None:
                sys.modules[n] = orig
            else:
                sys.modules.pop(n, None)


# ── Sheet presence & strict order ────────────────────────────────

def test_fixed_sheets_present(wb_and_ds):
    wb = wb_and_ds[0]
    names = wb.sheetnames
    for s in SHEET_ORDER_FIXED:
        assert s in names, f"Missing sheet '{s}'"


def test_metadata_last(wb_and_ds):
    wb = wb_and_ds[0]
    assert wb.sheetnames[-1] == "99_Metadata"


def test_strict_ordering(wb_and_ds):
    wb = wb_and_ds[0]
    names = wb.sheetnames
    fixed_positions = [names.index(s) for s in SHEET_ORDER_FIXED if s in names]
    assert fixed_positions == sorted(fixed_positions), "Fixed sheets out of order"


def test_extras_between_hourly_and_metadata(wb_and_ds):
    wb = wb_and_ds[0]
    names = wb.sheetnames
    extras = [n for n in names if n.startswith("97_Extra_")]
    if extras:
        hourly_idx = names.index("96_Hourly_Data")
        meta_idx = names.index("99_Metadata")
        for e in extras:
            idx = names.index(e)
            assert hourly_idx < idx < meta_idx


# ── 01_Overview schema ───────────────────────────────────────────

_OVERVIEW_COLS = [
    "Period From", "Period To", "Revenue Total", "Bookings Total",
    "Avg Check", "Cancel Rate %", "Utilization %",
    "Revenue vs Prev Period %", "Bookings vs Prev Period %",
    "Top Activity (by Revenue)", "Biggest Growth Area (MoM Revenue)",
    "Forecast Month (YYYY-MM)",
    "Forecast Revenue (Month Total)", "Forecast Revenue CI Low",
    "Forecast Revenue CI High",
    "Forecast Bookings (Month Total)", "Forecast Bookings CI Low",
    "Forecast Bookings CI High",
    "Model Family Used (Revenue)", "Notes",
]


def test_overview_columns(wb_and_ds):
    ws = wb_and_ds[0]["01_Overview"]
    hdr = [c.value for c in ws[1] if c.value is not None]
    assert hdr == _OVERVIEW_COLS


def test_overview_one_data_row(wb_and_ds):
    ws = wb_and_ds[0]["01_Overview"]
    data = [r for r in ws.iter_rows(min_row=2) if any(c.value is not None for c in r)]
    assert len(data) == 1


# ── 03_Forecast_Summary is ONE ROW, no daily lines ──────────────

def test_forecast_summary_one_row(wb_and_ds):
    ws = wb_and_ds[0]["03_Forecast_Summary"]
    data = [r for r in ws.iter_rows(min_row=2) if any(c.value is not None for c in r)]
    assert len(data) == 1


def test_forecast_summary_no_date_column(wb_and_ds):
    ws = wb_and_ds[0]["03_Forecast_Summary"]
    hdr = [c.value for c in ws[1] if c.value is not None]
    assert "date" not in [h.lower() for h in hdr if h != "Forecast Month (YYYY-MM)"]


# ── 04_Risks_And_Actions columns ─────────────────────────────────

def test_risks_columns(wb_and_ds):
    ws = wb_and_ds[0]["04_Risks_And_Actions"]
    hdr = [c.value for c in ws[1] if c.value is not None]
    for col in ["Type", "Severity", "Title", "Metric Evidence",
                "Evidence Value", "Recommended Action"]:
        assert col in hdr, f"Missing '{col}' in 04_Risks_And_Actions"


# ── Freeze panes ─────────────────────────────────────────────────

def test_freeze_panes_A2(wb_and_ds):
    wb = wb_and_ds[0]
    for sn in wb.sheetnames:
        ws = wb[sn]
        assert ws.freeze_panes == "A2", f"{sn}: freeze_panes={ws.freeze_panes}"


# ── Header styling ───────────────────────────────────────────────

def test_management_headers_bold(wb_and_ds):
    for sn in ("01_Overview", "02_Monthly_Performance", "03_Forecast_Summary"):
        ws = wb_and_ds[0][sn]
        for cell in ws[1]:
            if cell.value is not None:
                assert cell.font.bold, f"'{cell.value}' in {sn} not bold"


# ── Autofilter ───────────────────────────────────────────────────

def test_autofilter_on_management(wb_and_ds):
    ws = wb_and_ds[0]["02_Monthly_Performance"]
    assert ws.auto_filter.ref


def test_autofilter_on_operational(wb_and_ds):
    ws = wb_and_ds[0]["10_Revenue"]
    assert ws.auto_filter.ref


# ── Serialisation ────────────────────────────────────────────────

def test_valid_xlsx(wb_and_ds):
    data = workbook_to_bytes(wb_and_ds[0])
    assert data[:4] == b"PK\x03\x04"
    assert len(data) > 500


# ── sanitize / ensure_no_unnamed ─────────────────────────────────

def test_sanitize_drops_unnamed():
    df = pd.DataFrame({"a": [1], "Unnamed: 0": [2]})
    out = sanitize_dataframe(df)
    assert "Unnamed: 0" not in out.columns


def test_ensure_no_unnamed_raises():
    df = pd.DataFrame({"Unnamed: 0": [1]})
    with pytest.raises(AssertionError):
        ensure_no_unnamed(df)


# ── Sheet name length ────────────────────────────────────────────

def test_sheet_names_under_31():
    for s in SHEET_ORDER_FIXED:
        assert len(s) <= 31


# ── Number format on currency column ─────────────────────────────

def test_currency_format_on_overview(wb_and_ds):
    ws = wb_and_ds[0]["01_Overview"]
    col = None
    for c in ws[1]:
        if c.value == "Revenue Total":
            col = c.column
            break
    assert col is not None
    assert "#,##0" in ws.cell(row=2, column=col).number_format
