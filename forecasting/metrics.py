"""Forecast accuracy metrics with safe zero handling."""

from __future__ import annotations

import numpy as np

_EPS = 1e-8


def mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """MAPE with scaled denominator to avoid zero-inflation.

    Uses max(|y_true_i|, scale) where scale = max(mean(|y_true|) * 0.01, 1.0)
    so that zero-actual days don't produce astronomically large errors.
    """
    y_true = np.asarray(y_true, dtype=np.float64)
    y_pred = np.asarray(y_pred, dtype=np.float64)
    scale = max(float(np.mean(np.abs(y_true))) * 0.01, 1.0)
    denom = np.maximum(np.abs(y_true), scale)
    return float(np.mean(np.abs(y_true - y_pred) / denom))


def smape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=np.float64)
    y_pred = np.asarray(y_pred, dtype=np.float64)
    denom = np.abs(y_true) + np.abs(y_pred) + _EPS
    return float(np.mean(2.0 * np.abs(y_true - y_pred) / denom))


def mae(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.mean(np.abs(np.asarray(y_true) - np.asarray(y_pred))))


def rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    return float(np.sqrt(np.mean((np.asarray(y_true) - np.asarray(y_pred)) ** 2)))


def all_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {
        "mape": round(mape(y_true, y_pred), 6),
        "smape": round(smape(y_true, y_pred), 6),
        "mae": round(mae(y_true, y_pred), 4),
        "rmse": round(rmse(y_true, y_pred), 4),
    }


def score_by_name(name: str, y_true: np.ndarray, y_pred: np.ndarray) -> float:
    """Look up a metric by string name."""
    _FNS = {"mape": mape, "smape": smape, "mae": mae, "rmse": rmse}
    fn = _FNS.get(name, mape)
    return fn(y_true, y_pred)
