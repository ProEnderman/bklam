"""Forecast orchestrator — public API for Java backend."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd

from types_ import TimeSeries, ForecastResult, ModelCandidate
from transforms import get_transform
from baselines import forecast_ma7, forecast_same_day_last_week
from sarima import fit_forecast_sarima
from prophet_model import fit_forecast_prophet
from sarimax_exog import fit_forecast_sarimax_exog
from selector import select_model
from holidays import HolidayProvider, SpecialEventProvider, build_holiday_flags, merge_prophet_holidays
from regressors import build_train_exog, build_future_exog
from hierarchical import forecast_hierarchical_total
from registry import get_leaderboard_summary
from repository import (
    load_metric, load_base_series, load_special_events,
    load_daily_revenue_by_activity, load_daily_bookings_by_activity,
    list_segments, save_spec, load_spec, save_forecast_result, load_latest_forecast,
    save_monthly_rollup, load_monthly_rollup, load_actual_monthly, month_is_closed,
    load_daily_actuals_for_month,
)
from diagnostics import explosion_guard, get_explosion_log, reset_explosion_log
from selector import get_last_selection_report
from registry import validate_registry_integrity, get_leaderboard
from config import (
    METRICS, DEFAULT_HORIZON_DAYS, MIN_HISTORY_DAYS, RETRAIN_INTERVAL_DAYS,
    UTILIZATION_CLIP, CANCEL_RATE_CLIP, EXPLOSION_LOOKBACK_DAYS,
    HIERARCHICAL_ENABLED_DEFAULT, MODEL_FAMILY_PROPHET, MODEL_FAMILY_SARIMAX_EXOG,
    MODEL_FAMILY_TWO_STAGE,
    MODEL_FAMILY_ENSEMBLE,
)

logger = logging.getLogger(__name__)


def _clip_output(metric: str, values: np.ndarray) -> np.ndarray:
    if metric == "revenue":
        return np.maximum(values, 0.0)
    if metric == "bookings":
        return np.maximum(np.round(values), 0.0)
    if metric == "utilization":
        return np.clip(values, UTILIZATION_CLIP[0], UTILIZATION_CLIP[1])
    if metric == "cancel_rate":
        return np.clip(values, CANCEL_RATE_CLIP[0], CANCEL_RATE_CLIP[1])
    return values


def _trend_direction(values: list[float]) -> str:
    if len(values) < 3:
        return "stable"
    half = len(values) // 2
    first = np.mean(values[:half])
    second = np.mean(values[half:])
    pct = (second - first) / max(abs(first), 1e-6) * 100
    if pct > 3:
        return "up"
    if pct < -3:
        return "down"
    return "stable"


class ForecastService:

    def __init__(self):
        self._hp = HolidayProvider()
        self._ep = SpecialEventProvider()

    def train_and_select(
        self, metric: str, restaurant_id: Optional[int] = None, force: bool = False,
        token: Optional[str] = None,
    ) -> dict:
        if metric not in METRICS:
            return {"error": f"Unknown metric: {metric}"}

        tenant_id = restaurant_id
        if not force:
            spec = load_spec(metric, tenant_id=tenant_id)
            if spec and spec.get("trained_at"):
                try:
                    trained = datetime.fromisoformat(spec["trained_at"])
                    if (datetime.now() - trained).days < RETRAIN_INTERVAL_DAYS:
                        return {"status": "skipped", "reason": "recent_model_exists", "spec": spec}
                except (ValueError, TypeError):
                    pass

        ts = load_metric(metric, rid=restaurant_id, token=token)
        if len(ts) < MIN_HISTORY_DAYS:
            spec = {
                "model_name": "ma7", "model_family": "baseline",
                "params": {"window": 7}, "transform_name": "identity",
                "mean_mape": None, "trained_at": datetime.now().isoformat(),
                "warnings": ["insufficient_data"],
            }
            save_spec(metric, spec, tenant_id=tenant_id)
            return {"status": "trained", "spec": spec}

        base_series = load_base_series(rid=restaurant_id)

        candidate = select_model(
            ts, metric,
            base_series=base_series,
            holiday_provider=self._hp,
            event_provider=self._ep,
        )
        spec = candidate.to_spec()
        spec["trained_at"] = datetime.now().isoformat()
        spec["data_points"] = len(ts)
        save_spec(metric, spec, tenant_id=tenant_id)

        logger.info(
            "%s trained: %s [%s], score=%.4f",
            metric, candidate.model_name, candidate.model_family, candidate.mean_mape,
        )
        return {"status": "trained", "spec": spec}

    def forecast(
        self,
        metric: str,
        horizon: int = DEFAULT_HORIZON_DAYS,
        restaurant_id: Optional[int] = None,
        hierarchical: Optional[bool] = None,
        token: Optional[str] = None,
    ) -> dict:
        if metric not in METRICS:
            return {"error": f"Unknown metric: {metric}"}

        # Hierarchical path for revenue/bookings
        if hierarchical and metric in ("revenue", "bookings"):
            return self._forecast_hierarchical(metric, horizon, restaurant_id)

        tenant_id = restaurant_id
        spec = load_spec(metric, tenant_id=tenant_id)
        if spec is None:
            result = self.train_and_select(metric, restaurant_id=restaurant_id, force=True, token=token)
            if "error" in result:
                return result
            spec = result.get("spec") or load_spec(metric, tenant_id=tenant_id)
            if spec is None:
                return {"error": "training_failed"}

        ts = load_metric(metric, rid=restaurant_id, token=token)
        if len(ts) == 0:
            return {"error": "no_data"}

        model_name = spec.get("model_name", "ma7")
        model_family = spec.get("model_family", model_name)
        transform = get_transform(metric)

        if model_name == "ensemble":
            result = self._forecast_ensemble(ts, spec, horizon, metric, restaurant_id, token=token)
            if result is None:
                result = forecast_ma7(ts, horizon)
        elif model_name == "two_stage":
            result = self._forecast_two_stage(ts, horizon, restaurant_id, token=token)
            if result is None:
                result = forecast_ma7(ts, horizon)
        elif model_name == "sarima":
            result = self._forecast_sarima(ts, spec, transform, horizon, metric)
        elif model_name == "prophet":
            result = self._forecast_prophet(ts, spec, transform, horizon, metric)
        elif model_name == "sarimax_exog":
            result = self._forecast_sarimax_exog(ts, spec, transform, horizon, metric, restaurant_id, token=token)
        elif model_name == "same_day_last_week":
            result = forecast_same_day_last_week(ts, horizon)
        else:
            result = forecast_ma7(ts, horizon)

        yhat = _clip_output(metric, np.array(result.yhat))
        lo = _clip_output(metric, np.array(result.yhat_lower))
        hi = _clip_output(metric, np.array(result.yhat_upper))
        lo = np.minimum(lo, yhat)
        hi = np.maximum(hi, yhat)

        result.yhat = [round(float(v), 2) for v in yhat]
        result.yhat_lower = [round(float(v), 2) for v in lo]
        result.yhat_upper = [round(float(v), 2) for v in hi]
        result.mape_rolling = spec.get("mean_mape")
        result.model_name = model_name
        result.model_family = model_family
        result.transform_name = spec.get("transform_name", "identity")

        save_forecast_result(metric, result, tenant_id=tenant_id)
        trend = _trend_direction(result.yhat)
        leaderboard = get_leaderboard_summary(metric)

        mape_pct = round(spec.get("mean_mape", 0) * 100, 2) if spec.get("mean_mape") else None

        return {
            "metric": metric,
            "model": model_name,
            "model_family": model_family,
            "transform": spec.get("transform_name", "identity"),
            "params": spec.get("params", {}),
            "horizon": horizon,
            "train_end": result.train_end,
            "created_at": result.created_at,
            "mape_rolling": mape_pct,
            "trend": trend,
            "mape": mape_pct,
            "dates": result.dates,
            "yhat": result.yhat,
            "yhat_lower": result.yhat_lower,
            "yhat_upper": result.yhat_upper,
            "diagnostics": spec.get("diagnostics", {}),
            "leaderboard": leaderboard,
            "segments": result.segments,
            # Two-stage composition metadata
            **({"components": result.components} if result.components else {}),
            **({"composed_from": result.composed_from} if result.composed_from else {}),
            **({"direct_competitor": result.direct_competitor} if result.direct_competitor else {}),
            **({"ensemble_weights": result.ensemble_weights} if result.ensemble_weights else {}),
            **({"ensemble_members": result.ensemble_members} if result.ensemble_members else {}),
            **({"ensemble_blend_mode": result.ensemble_blend_mode} if result.ensemble_blend_mode else {}),
            # Backward-compatible fields
            "forecast": result.dates,
            "values": result.yhat,
            "lower_bound": result.yhat_lower,
            "upper_bound": result.yhat_upper,
        }

    def _forecast_sarima(self, ts, spec, transform, horizon, metric) -> ForecastResult:
        params = spec.get("params", {})
        order = tuple(params.get("order", [1, 1, 1]))
        seasonal = tuple(params.get("seasonal_order", [1, 1, 1, 7]))

        y_t = transform.forward(ts.values)
        yhat_t, lower_t, upper_t, diag = fit_forecast_sarima(y_t, order, seasonal, horizon)

        last_date = ts.dates[-1]
        dates = [(last_date + pd.Timedelta(days=i + 1)).strftime("%Y-%m-%d") for i in range(horizon)]

        if yhat_t is None:
            return forecast_ma7(ts, horizon)

        yhat = transform.inverse(yhat_t)
        lo, hi = transform.inverse_interval(lower_t, upper_t)

        guard = explosion_guard(yhat, ts.values[-min(EXPLOSION_LOOKBACK_DAYS, len(ts)):])
        if guard["explosion_guard_triggered"]:
            return forecast_ma7(ts, horizon)

        return ForecastResult(dates=dates, yhat=yhat.tolist(), yhat_lower=lo.tolist(),
                              yhat_upper=hi.tolist(), model_name="sarima", model_family="sarima",
                              params=params, transform_name=transform.name,
                              train_end=last_date.strftime("%Y-%m-%d"), diagnostics=diag)

    def _forecast_prophet(self, ts, spec, transform, horizon, metric) -> ForecastResult:
        params = spec.get("params", {})
        holidays_df = None
        try:
            hdf = self._hp.holidays_df(ts.dates[0].date(), ts.dates[-1].date())
            edf = self._ep.events_df(ts.dates[0].date(), ts.dates[-1].date())
            holidays_df = merge_prophet_holidays(hdf, edf)
        except Exception:
            pass

        yhat, lo, hi, diag = fit_forecast_prophet(ts, transform, horizon, holidays_df=holidays_df, config=params)
        last_date = ts.dates[-1]
        dates = [(last_date + pd.Timedelta(days=i + 1)).strftime("%Y-%m-%d") for i in range(horizon)]

        if yhat is None:
            return forecast_ma7(ts, horizon)

        guard = explosion_guard(yhat, ts.values[-min(EXPLOSION_LOOKBACK_DAYS, len(ts)):])
        if guard["explosion_guard_triggered"]:
            return forecast_ma7(ts, horizon)

        return ForecastResult(dates=dates, yhat=yhat.tolist(), yhat_lower=lo.tolist(),
                              yhat_upper=hi.tolist(), model_name="prophet", model_family="prophet",
                              params=params, transform_name=transform.name,
                              train_end=last_date.strftime("%Y-%m-%d"), diagnostics=diag)

    def _forecast_sarimax_exog(self, ts, spec, transform, horizon, metric, rid, token: Optional[str] = None) -> ForecastResult:
        params = spec.get("params", {})
        order = tuple(params.get("order", [1, 1, 1]))
        seasonal = tuple(params.get("seasonal_order", [1, 1, 1, 7]))

        base_series = load_base_series(rid=rid, token=token)
        hdf = self._hp.holidays_df(ts.dates[0].date(), ts.dates[-1].date())
        edf = self._ep.events_df(ts.dates[0].date(), ts.dates[-1].date())
        h_flags = build_holiday_flags(ts.dates, hdf, edf)

        exog_train = build_train_exog(metric, ts.dates, base_series, h_flags)
        last_date = ts.dates[-1]
        future_dates = pd.date_range(last_date + pd.Timedelta(days=1), periods=horizon, freq="D")
        future_hflags = build_holiday_flags(future_dates, hdf, edf)
        exog_future = build_future_exog(metric, future_dates, exog_train, future_hflags)

        y_t = transform.forward(ts.values)
        yhat_t, lo_t, hi_t, diag = fit_forecast_sarimax_exog(
            y_t, order, seasonal, exog_train.values, exog_future.values, horizon)

        dates = [d.strftime("%Y-%m-%d") for d in future_dates]

        if yhat_t is None:
            return forecast_ma7(ts, horizon)

        yhat = transform.inverse(yhat_t)
        lo, hi = transform.inverse_interval(lo_t, hi_t)

        guard = explosion_guard(yhat, ts.values[-min(EXPLOSION_LOOKBACK_DAYS, len(ts)):])
        if guard["explosion_guard_triggered"]:
            return forecast_ma7(ts, horizon)

        return ForecastResult(dates=dates, yhat=yhat.tolist(), yhat_lower=lo.tolist(),
                              yhat_upper=hi.tolist(), model_name="sarimax_exog",
                              model_family="sarimax_exog", params=params,
                              transform_name=transform.name,
                              train_end=last_date.strftime("%Y-%m-%d"), diagnostics=diag)

    def _forecast_ensemble(self, ts, spec, horizon, metric, rid, token: Optional[str] = None) -> Optional[ForecastResult]:
        """Produce ensemble forecast by blending member forecasts with stored weights."""
        from ensemble import blend_predictions, blend_intervals

        params = spec.get("params", {})
        weights = params.get("weights", {})
        members = params.get("members", [])
        mode = params.get("mode", "global")

        if not weights or not members:
            return None

        base_series = load_base_series(rid=rid, token=token)
        transform = get_transform(metric)
        last_date = ts.dates[-1]
        future_dates = pd.date_range(last_date + pd.Timedelta(days=1), periods=horizon, freq="D")
        dates_str = [d.strftime("%Y-%m-%d") for d in future_dates]

        preds: dict[str, np.ndarray] = {}
        lowers: dict[str, np.ndarray] = {}
        uppers: dict[str, np.ndarray] = {}

        for member in members:
            mr = None
            if member == "sarima":
                mr = self._forecast_sarima(ts, spec, transform, horizon, metric)
            elif member == "prophet":
                mr = self._forecast_prophet(ts, spec, transform, horizon, metric)
            elif member == "sarimax_exog":
                mr = self._forecast_sarimax_exog(ts, spec, transform, horizon, metric, rid)

            if mr is None or not mr.yhat:
                fallback_val = float(np.mean(ts.values[-28:]))
                preds[member] = np.full(horizon, fallback_val)
                lowers[member] = np.full(horizon, fallback_val * 0.8)
                uppers[member] = np.full(horizon, fallback_val * 1.2)
            else:
                preds[member] = np.array(mr.yhat)
                lowers[member] = np.array(mr.yhat_lower)
                uppers[member] = np.array(mr.yhat_upper)

        yhat = blend_predictions(preds, future_dates, weights, mode)
        lo, hi = blend_intervals(lowers, uppers, future_dates, weights, mode)

        guard = explosion_guard(yhat, ts.values[-min(EXPLOSION_LOOKBACK_DAYS, len(ts)):])
        if guard["explosion_guard_triggered"]:
            return None

        return ForecastResult(
            dates=dates_str,
            yhat=yhat.tolist(),
            yhat_lower=lo.tolist(),
            yhat_upper=hi.tolist(),
            model_name="ensemble",
            model_family=MODEL_FAMILY_ENSEMBLE,
            params=params,
            transform_name="ensemble",
            train_end=last_date.strftime("%Y-%m-%d"),
            ensemble_weights=weights,
            ensemble_members=members,
            ensemble_blend_mode=mode,
        )

    def _forecast_two_stage(self, ts, horizon, rid, token: Optional[str] = None) -> Optional[ForecastResult]:
        from two_stage import forecast_two_stage_revenue
        from avg_check import compute_avg_check_series

        bookings_ts = load_metric("bookings", rid=rid, token=token)
        avg_check_ts = compute_avg_check_series(ts, bookings_ts)
        base_series = load_base_series(rid=rid, token=token)

        return forecast_two_stage_revenue(
            ts, bookings_ts, avg_check_ts, horizon,
            base_series=base_series,
            holiday_provider=self._hp,
            event_provider=self._ep,
        )

    def _forecast_hierarchical(self, metric, horizon, rid) -> dict:
        seg_loader = load_daily_revenue_by_activity if metric == "revenue" else load_daily_bookings_by_activity
        segments_data = seg_loader()
        seg_list = list_segments()
        seg_names = {s["id"]: s["name"] for s in seg_list}

        def _seg_forecast(ts_seg, met, h, seg_id):
            transform = get_transform(met)
            from baselines import forecast_same_day_last_week as sdlw
            return sdlw(ts_seg, h)

        result = forecast_hierarchical_total(metric, segments_data, seg_names, _seg_forecast, horizon)
        if result is None:
            return self.forecast(metric, horizon, rid, hierarchical=False)

        yhat = _clip_output(metric, np.array(result.yhat))
        lo = _clip_output(metric, np.array(result.yhat_lower))
        hi = _clip_output(metric, np.array(result.yhat_upper))
        lo = np.minimum(lo, yhat)
        hi = np.maximum(hi, yhat)

        return {
            "metric": metric,
            "model": "hierarchical_total",
            "model_family": "hierarchical",
            "transform": "identity",
            "params": result.params,
            "horizon": horizon,
            "train_end": result.train_end,
            "created_at": result.created_at,
            "mape_rolling": None,
            "trend": _trend_direction([round(float(v), 2) for v in yhat]),
            "mape": None,
            "dates": result.dates,
            "yhat": [round(float(v), 2) for v in yhat],
            "yhat_lower": [round(float(v), 2) for v in lo],
            "yhat_upper": [round(float(v), 2) for v in hi],
            "diagnostics": {},
            "segments": result.segments,
            "forecast": result.dates,
            "values": [round(float(v), 2) for v in yhat],
            "lower_bound": [round(float(v), 2) for v in lo],
            "upper_bound": [round(float(v), 2) for v in hi],
        }

    def get_accuracy(self, metric: str, restaurant_id: Optional[int] = None) -> dict:
        spec = load_spec(metric, tenant_id=restaurant_id)
        if spec is None:
            return {"status": "no_model", "mape": None}
        return {
            "status": "ok",
            "model": spec.get("model_name"),
            "model_family": spec.get("model_family"),
            "mape": round(spec.get("mean_mape", 0) * 100, 2) if spec.get("mean_mape") else None,
            "transform": spec.get("transform_name"),
            "params": spec.get("params"),
            "trained_at": spec.get("trained_at"),
            "diagnostics": spec.get("diagnostics", {}),
        }

    def compare_actual_vs_forecast(self, metric: str, restaurant_id: Optional[int] = None, token: Optional[str] = None) -> dict:
        fc = load_latest_forecast(metric, tenant_id=restaurant_id)
        ts = load_metric(metric, rid=restaurant_id, token=token)
        if fc is None or len(ts) == 0:
            return {"dates": [], "actual": [], "forecast": [], "lower": [], "upper": []}
        ts_df = pd.DataFrame({"ds": ts.dates.strftime("%Y-%m-%d"), "y": ts.values})
        ts_dict = dict(zip(ts_df["ds"], ts_df["y"]))
        dates, actual, forecast_vals, lower, upper = [], [], [], [], []
        for i, d in enumerate(fc.dates):
            dates.append(d)
            forecast_vals.append(fc.yhat[i])
            lower.append(fc.yhat_lower[i])
            upper.append(fc.yhat_upper[i])
            actual.append(round(float(ts_dict.get(d, 0)), 2))
        return {"metric": metric, "dates": dates, "actual": actual,
                "forecast": forecast_vals, "lower": lower, "upper": upper}

    def get_leaderboard(self, metric: str, segment_id: Optional[str] = None) -> dict:
        return get_leaderboard_summary(metric, segment_id)

    def get_validation_summary(self, metric: str) -> dict:
        report = get_last_selection_report()
        if not report or report.get("metric") != metric:
            return {"metric": metric, "status": "no_recent_selection", "hint": "run train first"}

        lb = get_leaderboard(metric)
        lb_data = [e.to_dict() for e in lb[:5]]

        summary = dict(report)
        summary["leaderboard_top_5"] = lb_data
        return summary

    def get_registry_validate(self, metric: str) -> dict:
        return validate_registry_integrity(metric)

    def get_hierarchical_validate(self, metric: str, horizon: int = DEFAULT_HORIZON_DAYS,
                                  restaurant_id: Optional[int] = None, token: Optional[str] = None) -> dict:
        from hierarchical import validate_hierarchical

        seg_loader = load_daily_revenue_by_activity if metric == "revenue" else load_daily_bookings_by_activity
        try:
            segments_data = seg_loader()
        except Exception:
            segments_data = {}

        seg_list = list_segments()
        seg_names = {s["id"]: s["name"] for s in seg_list}

        def _seg_fc(ts_seg, met, h, seg_id):
            from baselines import forecast_same_day_last_week as sdlw
            return sdlw(ts_seg, h)

        def _direct_fc(met, h):
            ts = load_metric(met, rid=restaurant_id, token=token)
            from baselines import forecast_same_day_last_week as sdlw
            return sdlw(ts, h)

        return validate_hierarchical(metric, segments_data, seg_names, _seg_fc, _direct_fc, horizon)

    # ─── Monthly aggregation & monitoring ─────────

    def get_monthly_forecast(
        self,
        metric: str,
        year: int,
        month: int,
        force_refresh: bool = False,
        token: Optional[str] = None,
        restaurant_id: Optional[int] = None,
    ) -> dict:
        from aggregation import build_full_month_snapshot

        tenant_id = restaurant_id
        if not force_refresh:
            cached = load_monthly_rollup(metric, year, month, tenant_id=tenant_id)
            if cached is not None:
                return cached

        daily = load_latest_forecast(metric, tenant_id=tenant_id)
        if daily is None:
            return {
                "error": "no_forecast_available",
                "message": "На данный момент недостаточно данных для аналитики и прогноза. Загрузите данные по заказам или подождите некоторое время — после накопления истории прогноз появится автоматически.",
                "metric": metric,
                "year": year,
                "month": month,
            }

        daily_actuals = load_daily_actuals_for_month(metric, year, month, token=token)
        bookings_fc = load_latest_forecast("bookings", tenant_id=tenant_id) if metric == "avg_check" else None

        now_ts = datetime.now(tz=None).isoformat()
        rollup = build_full_month_snapshot(
            metric, year, month, daily, daily_actuals, bookings_fc, now_ts,
        )
        save_monthly_rollup(rollup, tenant_id=tenant_id)
        return rollup.to_dict()

    def run_monthly_monitoring(self, metric: str, year: int, month: int, token: Optional[str] = None, restaurant_id: Optional[int] = None) -> dict:
        from monitoring import evaluate_monthly_accuracy
        from registry import record_monthly_accuracy

        if not month_is_closed(year, month):
            return {"status": "not_closed", "metric": metric, "year": year, "month": month}

        rollup = load_monthly_rollup(metric, year, month, tenant_id=restaurant_id)
        if rollup is None:
            return {"status": "missing_forecast", "metric": metric, "year": year, "month": month}

        actual = load_actual_monthly(metric, year, month, token=token)
        if actual is None:
            return {"status": "missing_actuals", "metric": metric, "year": year, "month": month}

        predicted = rollup.get("predicted_total", rollup.predicted_total) if isinstance(rollup, dict) else rollup.predicted_total
        model_fam = rollup.get("model_family_used", "") if isinstance(rollup, dict) else rollup.model_family_used
        snapshot_ts = rollup.get("last_updated_timestamp", "") if isinstance(rollup, dict) else rollup.last_updated_timestamp

        entry = evaluate_monthly_accuracy(metric, year, month, predicted, actual)
        entry["model_family_used"] = model_fam
        entry["snapshot_timestamp"] = snapshot_ts
        record_monthly_accuracy(entry)
        return {"status": "ok", **entry}

    def get_month_progress(
        self,
        metric: str,
        year: int,
        month: int,
        token: Optional[str] = None,
        restaurant_id: Optional[int] = None,
    ) -> dict:
        """Live month-to-date progress: actual vs snapshot, revised projection."""
        import calendar as cal
        from aggregation import month_date_range

        tenant_id = restaurant_id
        snapshot = load_monthly_rollup(metric, year, month, tenant_id=tenant_id)
        if snapshot is None:
            snapshot = self.get_monthly_forecast(metric, year, month, force_refresh=True, token=token, restaurant_id=tenant_id)
        if isinstance(snapshot, dict) and snapshot.get("error"):
            return {"error": snapshot["error"]}

        snap_predicted = snapshot["predicted_total"] if isinstance(snapshot, dict) else snapshot.predicted_total
        snap_notes = snapshot.get("notes", {}) if isinstance(snapshot, dict) else {}

        daily_actuals = load_daily_actuals_for_month(metric, year, month, token=token)
        total_days = cal.monthrange(year, month)[1]

        first, last = month_date_range(year, month)

        # Determine "business today": prefer actuals for this month, then full history
        if daily_actuals:
            last_actual = pd.Timestamp(max(daily_actuals.keys()))
            data_end = last_actual
        else:
            ts = load_metric(metric, token=token)
            if len(ts) > 0:
                data_end = pd.Timestamp(ts.dates[-1])
            else:
                data_end = pd.Timestamp.now()

        if data_end < first:
            days_elapsed = 0
        elif data_end > last:
            days_elapsed = total_days
        else:
            days_elapsed = (data_end - first).days + 1

        # Build pure forecast lookup (model predictions only, no actuals mixed in)
        daily = load_latest_forecast(metric, tenant_id=tenant_id)
        fc_lookup: dict[str, float] = {}
        if daily is not None:
            fc_dates = pd.DatetimeIndex(pd.to_datetime(daily.dates))
            fc_yhat = np.array(daily.yhat, dtype=np.float64)
            fc_lookup = {d.strftime("%Y-%m-%d"): float(fc_yhat[i]) for i, d in enumerate(fc_dates)}

        all_days = pd.date_range(first, last, freq="D")

        # forecast_plan: purely model-based values for each day (for "expected" calculation)
        forecast_plan: list[float] = []
        for day in all_days:
            key = day.strftime("%Y-%m-%d")
            forecast_plan.append(fc_lookup.get(key, 0.0))

        # Fill gaps with nearest neighbour when we have some forecast dates in this month
        for i in range(len(forecast_plan)):
            if forecast_plan[i] == 0.0 and all_days[i].strftime("%Y-%m-%d") not in fc_lookup:
                for j in range(i + 1, len(forecast_plan)):
                    if forecast_plan[j] != 0.0 or all_days[j].strftime("%Y-%m-%d") in fc_lookup:
                        forecast_plan[i] = forecast_plan[j]
                        break

        elapsed_dates = pd.date_range(first, periods=days_elapsed, freq="D")
        actual_so_far = sum(daily_actuals.get(d.strftime("%Y-%m-%d"), 0.0) for d in elapsed_dates)

        sum_forecast_plan = sum(forecast_plan)
        forecast_days_in_month = sum(1 for v in forecast_plan if v != 0.0)
        # When saved forecast has no dates in this month (e.g. horizon 14d from last data), prorate monthly total
        if sum_forecast_plan == 0.0 and total_days > 0 and snap_predicted is not None:
            expected_source = "prorate"
            daily_rate = snap_predicted / total_days
            predicted_for_elapsed_days = daily_rate * days_elapsed
            remaining_forecast = daily_rate * (total_days - days_elapsed)
        else:
            expected_source = "daily_forecast"
            predicted_for_elapsed_days = sum(forecast_plan[i] for i in range(days_elapsed))
            remaining_forecast = sum(forecast_plan[i] for i in range(days_elapsed, total_days))

        revised_total = actual_so_far + remaining_forecast

        variance = actual_so_far - predicted_for_elapsed_days
        variance_pct = (variance / predicted_for_elapsed_days * 100) if predicted_for_elapsed_days != 0 else 0.0

        if abs(variance_pct) < 5:
            pace = "on_track"
        elif variance_pct > 0:
            pace = "ahead"
        else:
            pace = "behind"

        return {
            "metric": metric,
            "year": year,
            "month": month,
            "total_days": total_days,
            "days_elapsed": days_elapsed,
            "days_remaining": total_days - days_elapsed,
            "actual_so_far": round(actual_so_far, 2),
            "predicted_for_elapsed_days": round(predicted_for_elapsed_days, 2),
            "variance": round(variance, 2),
            "variance_pct": round(variance_pct, 2),
            "pace": pace,
            "snapshot_total": round(snap_predicted, 2),
            "revised_total": round(revised_total, 2),
            "remaining_forecast": round(remaining_forecast, 2),
            "snapshot_actual_days": snap_notes.get("actual_days", 0),
            "snapshot_forecast_days": snap_notes.get("forecast_days", 0),
            "expected_source": expected_source,
            "forecast_days_in_month": forecast_days_in_month,
        }

    def get_monthly_forecast_by_segment(
        self,
        metric: str,
        year: int,
        month: int,
        restaurant_id: Optional[int] = None,
    ) -> dict:
        """Monthly forecast broken down by activity (segment).

        Uses same-day-last-week baseline per activity for fast inference
        (no backtests). Returns the standard monthly rollup enriched with
        a ``by_activity`` list.
        """
        from aggregation import slice_daily_to_month, aggregate_month_sum

        total_rollup = self.get_monthly_forecast(metric, year, month, restaurant_id=restaurant_id)

        segments_data = load_daily_bookings_by_activity() if metric == "bookings" else load_daily_revenue_by_activity()
        seg_list = list_segments()
        seg_names = {s["id"]: s["name"] for s in seg_list}

        horizon = DEFAULT_HORIZON_DAYS
        by_activity: list[dict] = []

        for seg_id, ts in segments_data.items():
            if len(ts) < 28:
                continue
            try:
                fc = forecast_same_day_last_week(ts, horizon)
            except Exception:
                continue

            dates = pd.DatetimeIndex(pd.to_datetime(fc.dates))
            yhat = np.array(fc.yhat, dtype=np.float64)
            lo = np.array(fc.yhat_lower, dtype=np.float64)
            hi = np.array(fc.yhat_upper, dtype=np.float64)

            sliced = slice_daily_to_month(dates, yhat, lo, hi, year, month)
            if sliced["covered_days"] == 0:
                continue

            pred, lo_t, hi_t = aggregate_month_sum(sliced["yhat"], sliced["lower"], sliced["upper"])

            by_activity.append({
                "segment_id": seg_id,
                "segment_name": seg_names.get(seg_id, f"Activity {seg_id}"),
                "predicted_total": round(pred, 1),
                "lower_total": round(lo_t, 1) if lo_t is not None else None,
                "upper_total": round(hi_t, 1) if hi_t is not None else None,
                "covered_days": sliced["covered_days"],
            })

        by_activity.sort(key=lambda x: x["predicted_total"], reverse=True)

        accounted = sum(a["predicted_total"] for a in by_activity)
        total_pred = total_rollup.get("predicted_total", 0) if isinstance(total_rollup, dict) else 0
        residual = total_pred - accounted
        if residual > 0.5:
            by_activity.append({
                "segment_id": "__other",
                "segment_name": "Прочие",
                "predicted_total": round(residual, 1),
                "lower_total": None,
                "upper_total": None,
                "covered_days": total_rollup.get("covered_days", 0) if isinstance(total_rollup, dict) else 0,
            })

        if isinstance(total_rollup, dict):
            total_rollup["by_activity"] = by_activity
        return total_rollup

    def train_all(self, restaurant_id: Optional[int] = None, force: bool = False, token: Optional[str] = None) -> dict:
        results = {}
        for m in METRICS:
            results[m] = self.train_and_select(m, restaurant_id=restaurant_id, force=force, token=token)
        return results
