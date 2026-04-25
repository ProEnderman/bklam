"""Core data structures for the forecasting module."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

import numpy as np
import pandas as pd


@dataclass
class TimeSeries:
    dates: pd.DatetimeIndex
    values: np.ndarray
    name: str

    def __post_init__(self):
        self.values = np.asarray(self.values, dtype=np.float64)
        if not isinstance(self.dates, pd.DatetimeIndex):
            self.dates = pd.DatetimeIndex(self.dates)

    def __len__(self) -> int:
        return len(self.values)

    def tail(self, n: int) -> TimeSeries:
        return TimeSeries(self.dates[-n:], self.values[-n:], self.name)

    def slice(self, start: int, end: int) -> TimeSeries:
        return TimeSeries(self.dates[start:end], self.values[start:end], self.name)


@dataclass
class ForecastResult:
    dates: list[str]
    yhat: list[float]
    yhat_lower: list[float]
    yhat_upper: list[float]
    model_name: str
    params: dict[str, Any]
    transform_name: str
    train_end: str
    created_at: str = field(default_factory=lambda: datetime.now(tz=None).isoformat())
    mape_rolling: Optional[float] = None
    diagnostics: dict[str, Any] = field(default_factory=dict)
    model_family: Optional[str] = None
    segment_id: Optional[str] = None
    segment_name: Optional[str] = None
    segments: Optional[list[dict]] = None
    leaderboard: Optional[dict] = None
    backtest: Optional[dict] = None
    components: Optional[dict] = None
    composed_from: Optional[str] = None
    direct_competitor: Optional[dict] = None
    ensemble_weights: Optional[dict] = None
    ensemble_members: Optional[list] = None
    ensemble_blend_mode: Optional[str] = None

    def to_dict(self) -> dict:
        d = {
            "dates": self.dates,
            "yhat": self.yhat,
            "yhat_lower": self.yhat_lower,
            "yhat_upper": self.yhat_upper,
            "model_name": self.model_name,
            "params": self.params,
            "transform_name": self.transform_name,
            "train_end": self.train_end,
            "created_at": self.created_at,
            "mape_rolling": self.mape_rolling,
            "diagnostics": self.diagnostics,
        }
        if self.model_family:
            d["model_family"] = self.model_family
        if self.segments:
            d["segments"] = self.segments
        if self.leaderboard:
            d["leaderboard"] = self.leaderboard
        if self.backtest:
            d["backtest"] = self.backtest
        if self.components:
            d["components"] = self.components
        if self.composed_from:
            d["composed_from"] = self.composed_from
        if self.direct_competitor:
            d["direct_competitor"] = self.direct_competitor
        if self.ensemble_weights:
            d["ensemble_weights"] = self.ensemble_weights
        if self.ensemble_members:
            d["ensemble_members"] = self.ensemble_members
        if self.ensemble_blend_mode:
            d["ensemble_blend_mode"] = self.ensemble_blend_mode
        return d


@dataclass
class BacktestFoldReport:
    fold_index: int
    train_start: str
    train_end: str
    test_start: str
    test_end: str
    last_7_train_actuals: list[float]
    test_actuals_summary: dict[str, Any]
    pred_summary: dict[str, Any]
    fold_mape: Optional[float] = None
    fold_smape: Optional[float] = None
    fold_mae: Optional[float] = None
    rejection_reason: Optional[str] = None


@dataclass
class BacktestDebugReport:
    metric: str
    model_name: str
    params: dict[str, Any]
    transform_name: str
    n_folds: int
    folds: list[BacktestFoldReport] = field(default_factory=list)
    mean_mape: Optional[float] = None
    mean_smape: Optional[float] = None
    mean_mae: Optional[float] = None
    data_summary: dict[str, Any] = field(default_factory=dict)


@dataclass
class ModelCandidate:
    model_name: str
    params: dict[str, Any]
    transform_name: str
    backtest_scores: list[float] = field(default_factory=list)
    mean_mape: float = float("inf")
    diagnostics: dict[str, Any] = field(default_factory=dict)
    is_valid: bool = True
    warnings: list[str] = field(default_factory=list)
    model_family: Optional[str] = None
    segment_id: Optional[str] = None
    segment_name: Optional[str] = None
    fit_time_ms: Optional[int] = None
    mean_smape: Optional[float] = None
    mean_mae: Optional[float] = None
    composed: bool = False
    component_models: Optional[dict] = None
    ensemble_weights: Optional[dict] = None
    ensemble_members: Optional[list] = None

    def to_spec(self) -> dict:
        return {
            "model_name": self.model_name,
            "model_family": self.model_family or self.model_name,
            "params": self.params,
            "transform_name": self.transform_name,
            "mean_mape": self.mean_mape,
            "mean_smape": self.mean_smape,
            "mean_mae": self.mean_mae,
            "diagnostics": self.diagnostics,
            "is_valid": self.is_valid,
            "warnings": self.warnings,
            "composed": self.composed,
            "component_models": self.component_models,
        }


@dataclass
class LeaderboardEntry:
    model_family: str
    params: dict[str, Any]
    transform_name: str
    mean_error: float
    metric_name: str
    segment_id: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now(tz=None).isoformat())

    def to_dict(self) -> dict:
        return {
            "model_family": self.model_family,
            "params": self.params,
            "transform_name": self.transform_name,
            "mean_error": round(self.mean_error, 6),
            "metric_name": self.metric_name,
            "segment_id": self.segment_id,
            "created_at": self.created_at,
        }


@dataclass
class RegistryRun:
    metric_name: str
    model_family: str
    params: dict[str, Any]
    transform_name: str
    mean_error: float
    fold_errors: list[float] = field(default_factory=list)
    diagnostics: dict[str, Any] = field(default_factory=dict)
    segment_id: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now(tz=None).isoformat())

    def to_dict(self) -> dict:
        return {
            "metric_name": self.metric_name,
            "model_family": self.model_family,
            "params": self.params,
            "transform_name": self.transform_name,
            "mean_error": round(self.mean_error, 6),
            "fold_errors": [round(e, 6) for e in self.fold_errors],
            "segment_id": self.segment_id,
            "created_at": self.created_at,
        }
