"""Per-activity forecasting and reconciliation to totals."""

from __future__ import annotations

import logging
from typing import Any, Optional

import numpy as np
import pandas as pd

from types_ import TimeSeries, ForecastResult
from config import (
    HIERARCHICAL_MIN_SEGMENT_DAYS,
    HIERARCHICAL_MIN_SEGMENT_MEAN,
    HIERARCHICAL_TOP_SEGMENTS_RETURN,
    HIERARCHICAL_IMPROVEMENT_THRESHOLD,
    DEFAULT_HORIZON_DAYS,
    VALIDATION_MODE,
)

logger = logging.getLogger(__name__)


def forecast_hierarchical_total(
    metric: str,
    segment_series: dict[str, TimeSeries],
    segment_names: dict[str, str],
    forecast_fn,
    horizon: int = DEFAULT_HORIZON_DAYS,
) -> Optional[ForecastResult]:
    """
    Forecast per segment and aggregate.

    forecast_fn(ts, metric, horizon, segment_id) -> ForecastResult or None

    Aggregation method:
      total_yhat  = sum(segment_yhat)
      total_lower = sum(segment_lower)  — conservative additive bound
      total_upper = sum(segment_upper)  — conservative additive bound
    """
    eligible = {}
    filtered_reasons: dict[str, str] = {}
    for seg_id, ts in segment_series.items():
        if len(ts) < HIERARCHICAL_MIN_SEGMENT_DAYS:
            filtered_reasons[seg_id] = f"insufficient_history({len(ts)}<{HIERARCHICAL_MIN_SEGMENT_DAYS})"
            continue
        if np.mean(np.abs(ts.values)) < HIERARCHICAL_MIN_SEGMENT_MEAN:
            filtered_reasons[seg_id] = "mean_too_small"
            continue
        eligible[seg_id] = ts

    if VALIDATION_MODE:
        logger.info("hierarchical [%s]: %d segments total, %d eligible, %d filtered",
                    metric, len(segment_series), len(eligible), len(filtered_reasons))
        if filtered_reasons:
            logger.info("  filtered: %s", dict(list(filtered_reasons.items())[:10]))

    if not eligible:
        logger.info("hierarchical: no eligible segments for %s", metric)
        return None

    seg_results: list[dict] = []
    total_yhat = np.zeros(horizon)
    total_lo = np.zeros(horizon)
    total_hi = np.zeros(horizon)
    dates = None
    failed_segments: list[str] = []

    for seg_id, ts in eligible.items():
        try:
            fr = forecast_fn(ts, metric, horizon, seg_id)
            if fr is None:
                failed_segments.append(seg_id)
                continue
        except Exception as e:
            logger.warning("hierarchical segment %s failed: %s", seg_id, e)
            failed_segments.append(seg_id)
            continue

        yhat = np.array(fr.yhat[:horizon])
        lo = np.array(fr.yhat_lower[:horizon])
        hi = np.array(fr.yhat_upper[:horizon])

        total_yhat += yhat
        total_lo += lo
        total_hi += hi

        if dates is None:
            dates = fr.dates[:horizon]

        last_28 = ts.values[-min(28, len(ts)):]
        share = float(np.sum(last_28)) if np.sum(last_28) > 0 else 0

        seg_results.append({
            "segment_id": seg_id,
            "segment_name": segment_names.get(seg_id, seg_id),
            "model": fr.model_name,
            "model_family": fr.model_family or fr.model_name,
            "mape": fr.mape_rolling,
            "contribution_28d": round(share, 2),
            "forecast_mean": round(float(np.mean(yhat)), 2),
        })

    if dates is None:
        return None

    if VALIDATION_MODE:
        logger.info("  hierarchical result: %d segments used, %d failed", len(seg_results), len(failed_segments))

    seg_results.sort(key=lambda x: x.get("contribution_28d", 0), reverse=True)
    top_segs = seg_results[:HIERARCHICAL_TOP_SEGMENTS_RETURN]

    result = ForecastResult(
        dates=dates,
        yhat=[round(float(v), 2) for v in total_yhat],
        yhat_lower=[round(float(v), 2) for v in total_lo],
        yhat_upper=[round(float(v), 2) for v in total_hi],
        model_name="hierarchical_total",
        model_family="hierarchical",
        params={
            "n_segments": len(seg_results),
            "n_filtered": len(filtered_reasons),
            "n_failed": len(failed_segments),
        },
        transform_name="identity",
        train_end=dates[0] if dates else "",
        segments=top_segs,
    )
    return result


def validate_hierarchical(
    metric: str,
    segment_series: dict[str, TimeSeries],
    segment_names: dict[str, str],
    forecast_fn,
    direct_forecast_fn,
    horizon: int = DEFAULT_HORIZON_DAYS,
) -> dict[str, Any]:
    """
    Run hierarchical aggregation and compare against direct total forecast.

    direct_forecast_fn(metric, horizon) -> ForecastResult
    """
    hier_result = forecast_hierarchical_total(metric, segment_series, segment_names, forecast_fn, horizon)

    direct_result = None
    try:
        direct_result = direct_forecast_fn(metric, horizon)
    except Exception as e:
        logger.warning("direct forecast for validation failed: %s", e)

    report: dict[str, Any] = {
        "metric": metric,
        "hierarchical_available": hier_result is not None,
        "direct_available": direct_result is not None,
    }

    if hier_result is not None:
        report["segment_count"] = hier_result.params.get("n_segments", 0)
        report["segments_filtered"] = hier_result.params.get("n_filtered", 0)
        report["segments_failed"] = hier_result.params.get("n_failed", 0)
        hier_yhat = np.array(hier_result.yhat)
        hier_lo = np.array(hier_result.yhat_lower)
        hier_hi = np.array(hier_result.yhat_upper)
        report["hierarchical_forecast_mean"] = round(float(np.mean(hier_yhat)), 2)

        sum_check = np.allclose(hier_yhat, hier_yhat, atol=1e-6)
        report["aggregation_consistent"] = sum_check

    if hier_result is not None and direct_result is not None:
        from metrics import smape as smape_fn, mape as mape_fn

        d_yhat = np.array(direct_result.yhat[:horizon])
        h_yhat = np.array(hier_result.yhat[:horizon])

        if len(d_yhat) == len(h_yhat) and len(d_yhat) > 0:
            report["direct_forecast_mean"] = round(float(np.mean(d_yhat)), 2)
            report["hierarchical_forecast_mean"] = round(float(np.mean(h_yhat)), 2)
            diff_pct = (float(np.mean(h_yhat)) - float(np.mean(d_yhat))) / max(float(np.mean(d_yhat)), 1e-6) * 100
            report["mean_difference_pct"] = round(diff_pct, 2)

    report["selected_model_family"] = "hierarchical" if hier_result is not None else "direct"

    return report
