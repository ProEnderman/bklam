"""Average check (revenue / bookings) series construction with safe imputation."""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd

from types_ import TimeSeries
from config import TWO_STAGE_AVG_CHECK_CLIP, TWO_STAGE_AVG_CHECK_IMPUTE_WINDOW

logger = logging.getLogger(__name__)


def compute_avg_check_series(
    revenue_ts: TimeSeries,
    bookings_ts: TimeSeries,
) -> TimeSeries:
    """Build daily avg_check = revenue / bookings with safe imputation.

    Days with bookings <= 0 are set to NaN and imputed via rolling median.
    Result is clipped to TWO_STAGE_AVG_CHECK_CLIP.
    """
    rev_s = pd.Series(revenue_ts.values, index=revenue_ts.dates, dtype=np.float64)
    bk_s = pd.Series(bookings_ts.values, index=bookings_ts.dates, dtype=np.float64)

    common = rev_s.index.intersection(bk_s.index)
    if len(common) == 0:
        logger.warning("avg_check: no overlapping dates between revenue and bookings")
        return TimeSeries(pd.DatetimeIndex([]), np.array([]), "avg_check")

    common = common.sort_values()
    rev = rev_s.reindex(common)
    bk = bk_s.reindex(common)

    avg = pd.Series(np.full(len(common), np.nan), index=common, dtype=np.float64)
    valid = bk > 0
    avg[valid] = rev[valid] / bk[valid]

    window = TWO_STAGE_AVG_CHECK_IMPUTE_WINDOW
    roll_med = avg.rolling(window, min_periods=1).median()
    avg = avg.fillna(roll_med)

    avg = avg.ffill(limit=7)
    avg = avg.bfill(limit=7)

    global_med = avg.median()
    if np.isfinite(global_med) and global_med > 0:
        avg = avg.fillna(global_med)
    else:
        avg = avg.fillna(1.0)

    lo, hi = TWO_STAGE_AVG_CHECK_CLIP
    avg = avg.clip(lower=lo, upper=hi)

    return TimeSeries(
        dates=pd.DatetimeIndex(common),
        values=avg.values.astype(np.float64),
        name="avg_check",
    )
