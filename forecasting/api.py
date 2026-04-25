"""FastAPI forecasting microservice — data via Java API only (no DB)."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Optional

from datetime import date

from fastapi import Depends, FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.security import require_internal_jwt, validate_internal_jwt_secret_or_raise
validate_internal_jwt_secret_or_raise()

from config import METRICS, DEFAULT_HORIZON_DAYS
from forecast_context import clear_forecast_context, set_forecast_context
from service import ForecastService

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

svc = ForecastService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Forecast service starting.")
    yield
    logger.info("Forecast service stopping.")


app = FastAPI(title="Booking Forecast Service", version="3.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_forecast_auth(auth: tuple[str, int] = Depends(require_internal_jwt)):
    """Validate internal JWT; yield (token, tenant_id) so sync code in thread pool can use token."""
    token, tenant_id = auth
    set_forecast_context(token, tenant_id)
    try:
        yield (token, tenant_id)
    finally:
        clear_forecast_context()


@app.get("/health")
def health():
    return {"status": "ok", "service": "forecast", "version": "3.0.0"}


# ─── Summary (requires internal JWT, data from Java) ─────────────────

@app.get("/api/forecast/summary")
def forecast_summary(
    auth: tuple[str, int] = Depends(_require_forecast_auth),
    horizon: int = Query(DEFAULT_HORIZON_DAYS, ge=1, le=90),
    restaurant_id: Optional[int] = Query(None),
):
    token, tenant_id = auth
    rid = restaurant_id if restaurant_id is not None else tenant_id
    result = {}
    for m in METRICS:
        try:
            result[m] = svc.forecast(m, horizon=horizon, restaurant_id=rid, token=token)
        except Exception as e:
            result[m] = {"error": str(e)}
    return result


# ─── Excel export ─────────────────────────────

@app.get("/api/forecast/export")
def export_excel(
    auth: tuple[str, int] = Depends(_require_forecast_auth),
    date_from: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    date_to: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    year: Optional[int] = Query(None, description="Forecast month year"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Forecast month"),
):
    token, tenant_id = auth
    from excel_exporter import collect_export_datasets, build_workbook, workbook_to_bytes

    d_from = date.fromisoformat(date_from) if date_from else None
    d_to = date.fromisoformat(date_to) if date_to else None

    datasets, metadata = collect_export_datasets(
        date_from=d_from, date_to=d_to, year=year, month=month, token=token, tenant_id=tenant_id,
    )
    wb = build_workbook(datasets, metadata)
    content = workbook_to_bytes(wb)

    filename = f"forecast_report_{metadata['date_from']}_{metadata['date_to']}.xlsx"
    return StreamingResponse(
        iter([content]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Training ─────────────────────────────────

@app.post("/api/forecast/train/{metric}")
def train_metric(
    auth: tuple[str, int] = Depends(_require_forecast_auth),
    metric: str = ...,
    restaurant_id: Optional[int] = Query(None),
    force: bool = Query(False),
):
    token, tenant_id = auth
    rid = restaurant_id if restaurant_id is not None else tenant_id
    if metric == "all":
        return svc.train_all(restaurant_id=rid, force=force, token=token)
    if metric not in METRICS:
        raise HTTPException(404, f"Unknown metric: {metric}. Options: {list(METRICS)}")
    return svc.train_and_select(metric, restaurant_id=rid, force=force, token=token)


# ─── Leaderboard ──────────────────────────────

@app.get("/api/forecast/{metric}/leaderboard")
def get_leaderboard(
    auth: tuple[str, int] = Depends(_require_forecast_auth),
    metric: str = ...,
    segment_id: Optional[str] = Query(None),
):
    _token, _tenant_id = auth
    if metric not in METRICS:
        raise HTTPException(404, f"Unknown metric: {metric}")
    return svc.get_leaderboard(metric, segment_id)


# ─── Accuracy ─────────────────────────────────

@app.get("/api/forecast/{metric}/accuracy")
def get_accuracy(
    auth: tuple[str, int] = Depends(_require_forecast_auth),
    metric: str = ...,
    restaurant_id: Optional[int] = Query(None),
):
    _token, tenant_id = auth
    rid = restaurant_id if restaurant_id is not None else tenant_id
    if metric not in METRICS:
        raise HTTPException(404, f"Unknown metric: {metric}")
    return svc.get_accuracy(metric, restaurant_id=rid)


# ─── Actual vs Forecast ──────────────────────

@app.get("/api/forecast/{metric}/vs-actual")
def vs_actual(
    auth: tuple[str, int] = Depends(_require_forecast_auth),
    metric: str = ...,
    restaurant_id: Optional[int] = Query(None),
):
    token, tenant_id = auth
    rid = restaurant_id if restaurant_id is not None else tenant_id
    if metric not in METRICS:
        raise HTTPException(404, f"Unknown metric: {metric}")
    return svc.compare_actual_vs_forecast(metric, restaurant_id=rid, token=token)


# ─── Validation endpoints ─────────────────────

@app.get("/api/forecast/{metric}/validation-summary")
def validation_summary(
    auth: tuple[str, int] = Depends(_require_forecast_auth),
    metric: str = ...,
):
    _token, _tenant_id = auth
    if metric not in METRICS:
        raise HTTPException(404, f"Unknown metric: {metric}")
    return svc.get_validation_summary(metric)


@app.get("/api/forecast/{metric}/registry-validate")
def registry_validate(
    auth: tuple[str, int] = Depends(_require_forecast_auth),
    metric: str = ...,
):
    _token, _tenant_id = auth
    if metric not in METRICS:
        raise HTTPException(404, f"Unknown metric: {metric}")
    return svc.get_registry_validate(metric)


@app.get("/api/forecast/{metric}/hierarchical-validate")
def hierarchical_validate(
    auth: tuple[str, int] = Depends(_require_forecast_auth),
    metric: str = ...,
    horizon: int = Query(DEFAULT_HORIZON_DAYS, ge=1, le=90),
    restaurant_id: Optional[int] = Query(None),
):
    token, tenant_id = auth
    rid = restaurant_id if restaurant_id is not None else tenant_id
    if metric not in METRICS:
        raise HTTPException(404, f"Unknown metric: {metric}")
    return svc.get_hierarchical_validate(metric, horizon, rid, token=token)


# ─── Monthly accuracy history ────────────────

@app.get("/api/forecast/{metric}/monthly-accuracy")
def monthly_accuracy(
    auth: tuple[str, int] = Depends(_require_forecast_auth),
    metric: str = ...,
    limit: int = Query(24, ge=1, le=120),
):
    _token, _tenant_id = auth
    if metric not in METRICS:
        raise HTTPException(404, f"Unknown metric: {metric}")
    from registry import get_monthly_accuracy
    return get_monthly_accuracy(metric, limit=limit)


# ─── Monthly monitoring trigger ──────────────

@app.post("/api/forecast/{metric}/monthly-monitoring")
def monthly_monitoring(
    auth: tuple[str, int] = Depends(_require_forecast_auth),
    metric: str = ...,
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    restaurant_id: Optional[int] = Query(None),
):
    token, tenant_id = auth
    rid = restaurant_id if restaurant_id is not None else tenant_id
    if metric not in METRICS:
        raise HTTPException(404, f"Unknown metric: {metric}")
    return svc.run_monthly_monitoring(metric, year, month, token=token, restaurant_id=rid)


# ─── Forecast (single metric) ────────────────

@app.get("/api/forecast/{metric}/month-progress")
def month_progress(
    auth: tuple[str, int] = Depends(_require_forecast_auth),
    metric: str = ...,
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    restaurant_id: Optional[int] = Query(None),
):
    token, tenant_id = auth
    rid = restaurant_id if restaurant_id is not None else tenant_id
    if metric not in METRICS:
        raise HTTPException(404, f"Unknown metric: {metric}")
    return svc.get_month_progress(metric, year, month, token=token, restaurant_id=rid)


@app.get("/api/forecast/{metric}")
def get_forecast(
    auth: tuple[str, int] = Depends(_require_forecast_auth),
    metric: str = ...,
    horizon: int = Query(DEFAULT_HORIZON_DAYS, ge=1, le=90),
    restaurant_id: Optional[int] = Query(None),
    hierarchical: Optional[bool] = Query(None),
    period: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    month: Optional[int] = Query(None, ge=1, le=12),
    force_refresh: Optional[bool] = Query(None),
    breakdown: Optional[str] = Query(None),
):
    token, tenant_id = auth
    rid = restaurant_id if restaurant_id is not None else tenant_id
    if metric not in METRICS:
        raise HTTPException(404, f"Unknown metric: {metric}")

    if period == "month":
        if year is None or month is None:
            raise HTTPException(400, "year and month query params are required when period=month")
        if breakdown == "activity":
            return svc.get_monthly_forecast_by_segment(metric, year, month, restaurant_id=rid)
        return svc.get_monthly_forecast(metric, year, month, force_refresh=bool(force_refresh), token=token, restaurant_id=rid)

    result = svc.forecast(metric, horizon=horizon, restaurant_id=rid, hierarchical=hierarchical, token=token)
    if "error" in result:
        err = result["error"]
        # no_data / training_failed — возвращаем 200 с телом, чтобы фронт показал сообщение, а не «ошибка сервера»
        if err in ("no_data", "training_failed"):
            return {
                "error": err,
                "message": "На данный момент недостаточно данных для аналитики и прогноза. Загрузите данные по заказам или подождите некоторое время — после накопления истории прогноз появится автоматически.",
            }
        raise HTTPException(500, err)
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=8090, reload=True)
