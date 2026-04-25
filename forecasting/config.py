"""Centralized configuration for the forecasting microservice."""

from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv()

# ── Java backend (no direct DB access) ───────────────
JAVA_BACKEND_URL = os.getenv("JAVA_BACKEND_URL", "http://localhost:8080").rstrip("/")

# ── Paths ─────────────────────────────────────────────
MODELS_DIR = os.getenv("MODELS_DIR", os.path.join(os.path.dirname(__file__), "models"))
SPECS_DIR = os.getenv("SPECS_DIR", os.path.join(os.path.dirname(__file__), "specs"))
REGISTRY_DIR = os.getenv("REGISTRY_DIR", os.path.join(os.path.dirname(__file__), "data", "registry"))

# ── Metrics ───────────────────────────────────────────
METRICS = ("revenue", "bookings", "cancel_rate", "utilization", "avg_check")

# ── Series parameters ─────────────────────────────────
SEASONAL_PERIOD = 7
MIN_HISTORY_DAYS = 90
DEFAULT_HORIZON_DAYS = 31

# ── Backtest ──────────────────────────────────────────
BACKTEST_HORIZON_DAYS = 31
BACKTEST_STEP_DAYS = 7
BACKTEST_MIN_FOLDS = 6

# ── Selector thresholds ──────────────────────────────
MAPE_CAP_FOR_SELECTOR = 0.50
SARIMA_BEAT_BASELINE_MARGIN = 0.03
MAX_CANDIDATES = 50

# ── Forecast guards ──────────────────────────────────
MAX_FORECAST_GROWTH_FACTOR = 2.5

# ── Clip bounds ──────────────────────────────────────
UTILIZATION_CLIP = (0.0, 100.0)
CANCEL_RATE_CLIP = (1e-4, 1.0 - 1e-4)

# ── Retrain policy ───────────────────────────────────
RETRAIN_INTERVAL_DAYS = 7

# ── Debug ────────────────────────────────────────────
DEBUG_BACKTEST = os.getenv("DEBUG_BACKTEST", "true").lower() in ("1", "true", "yes")

# ── Per-metric optimization metric ───────────────────
METRIC_OPTIMIZATION = {
    "revenue": "smape",
    "bookings": "mape",
    "utilization": "mape",
    "cancel_rate": "mae",
    "avg_check": "smape",
}

# ── Adaptive explosion guard ─────────────────────────
EXPLOSION_LOOKBACK_DAYS = 56
EXPLOSION_P90_FACTOR = 2.0
EXPLOSION_MAX_FACTOR = 1.2

# ── Prophet ──────────────────────────────────────────
PROPHET_INTERVAL_WIDTH = 0.80
PROPHET_SEASONALITY_MODE = "additive"
PROPHET_CHANGEPOINT_PRIOR_SCALE = 0.10
PROPHET_SEASONALITY_PRIOR_SCALE = 10.0
PROPHET_OUTLIER_CAP_Z = 4.0
PROPHET_MAX_CANDIDATES = 6

# ── SARIMAX with exog ───────────────────────────────
SARIMAX_EXOG_MAX_LAGS = 0
SARIMAX_EXOG_MAX_CANDIDATES = 60

# ── Regressors ───────────────────────────────────────
REGRESSOR_FUTURE_STRATEGY_DEFAULT = "seasonal_last_week"

# ── Holidays ─────────────────────────────────────────
HOLIDAY_COUNTRY_DEFAULT = "CH"

# ── Registry / leaderboard ───────────────────────────
REGISTRY_MAX_RUNS_PER_METRIC = 50
LEADERBOARD_TOP_K = 5

# ── Hierarchical ────────────────────────────────────
HIERARCHICAL_ENABLED_DEFAULT = True
HIERARCHICAL_MIN_SEGMENT_DAYS = 120
HIERARCHICAL_MIN_SEGMENT_MEAN = 1e-6
HIERARCHICAL_TOP_SEGMENTS_RETURN = 10
HIERARCHICAL_IMPROVEMENT_THRESHOLD = 0.02

# ── Model families ───────────────────────────────────
MODEL_FAMILY_BASELINE = "baseline"
MODEL_FAMILY_SARIMA = "sarima"
MODEL_FAMILY_PROPHET = "prophet"
MODEL_FAMILY_SARIMAX_EXOG = "sarimax_exog"
MODEL_FAMILY_HIERARCHICAL = "hierarchical"

# ── Per-family candidate caps ────────────────────────
MAX_CANDIDATES_SARIMA = 80
MAX_CANDIDATES_SARIMAX_EXOG = 60
MAX_CANDIDATES_PROPHET = 6

# ── Global selection timeout (seconds) ───────────────
SELECTOR_TIMEOUT_SECONDS = 120

# ── Two-stage (factorized) revenue model ────────────
MODEL_FAMILY_TWO_STAGE = "two_stage"
TWO_STAGE_ENABLED_DEFAULT = True
TWO_STAGE_MIN_HISTORY_DAYS = 120
TWO_STAGE_HORIZON_DAYS = DEFAULT_HORIZON_DAYS
TWO_STAGE_BACKTEST_HORIZON_DAYS = BACKTEST_HORIZON_DAYS
TWO_STAGE_BEAT_DIRECT_MARGIN = 0.005
TWO_STAGE_USE_LOG_COMPOSITION = True
TWO_STAGE_AVG_CHECK_CLIP = (0.01, 1e9)
TWO_STAGE_AVG_CHECK_IMPUTE_WINDOW = 28
TWO_STAGE_MAX_REVENUE_GROWTH_FACTOR = MAX_FORECAST_GROWTH_FACTOR
TWO_STAGE_INTERVAL_MODE = "conservative"
TWO_STAGE_TIMEOUT_SECONDS = 180
TWO_STAGE_INNER_SARIMA_CAP = 15
TWO_STAGE_INNER_PROPHET_CAP = 2
TWO_STAGE_INNER_EXOG_CAP = 10

# ── Weighted ensemble ────────────────────────────────
MODEL_FAMILY_ENSEMBLE = "ensemble"
ENSEMBLE_ENABLED_DEFAULT = True
ENSEMBLE_MIN_FOLDS = 6
ENSEMBLE_WEIGHT_MODE = "weekday"
ENSEMBLE_CANDIDATES = ["sarima", "prophet", "sarimax_exog"]
ENSEMBLE_MIN_WEIGHT = 0.05
ENSEMBLE_MAX_MODELS = 4
ENSEMBLE_BEAT_BEST_SINGLE_MARGIN = 0.002
ENSEMBLE_INTERVAL_MODE = "conservative"
ENSEMBLE_TIMEOUT_SEC = 120
ENSEMBLE_FOLD_RECENCY_ALPHA = 1.0
ENSEMBLE_SHRINKAGE_MIN_SAMPLES = 0
ENSEMBLE_SHRINKAGE_FLOOR = 0.0

# ── Validation diagnostics mode ──────────────────────
VALIDATION_MODE = os.getenv("VALIDATION_MODE", "true").lower() in ("1", "true", "yes")
