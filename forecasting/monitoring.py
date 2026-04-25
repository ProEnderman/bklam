"""Monthly forecast-vs-actual evaluation helpers."""

from __future__ import annotations

from datetime import datetime


def monthly_smape(actual: float, predicted: float, eps: float = 1e-9) -> float:
    """Symmetric MAPE for a single actual/predicted pair (returns 0..200)."""
    denom = abs(actual) + abs(predicted) + eps
    return float(2.0 * abs(actual - predicted) / denom * 100.0)


def monthly_mae(actual: float, predicted: float) -> float:
    return float(abs(actual - predicted))


def evaluate_monthly_accuracy(
    metric: str,
    year: int,
    month: int,
    predicted_total: float,
    actual_total: float,
) -> dict:
    """Compute sMAPE + MAE for a completed month and return an evaluation record."""
    smape = monthly_smape(actual_total, predicted_total)
    mae = monthly_mae(actual_total, predicted_total)

    actual_type = "mean" if metric in ("utilization", "cancel_rate", "avg_check") else "sum"

    return {
        "metric": metric,
        "year": year,
        "month": month,
        "predicted_total": round(predicted_total, 2),
        "actual_total": round(actual_total, 2),
        "actual_type": actual_type,
        "smape": round(smape, 4),
        "mae": round(mae, 2),
        "evaluated_at": datetime.now(tz=None).isoformat(),
    }
