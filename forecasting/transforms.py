"""Variance-stabilizing transforms with safe inverse and interval handling."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Tuple

import numpy as np

from config import CANCEL_RATE_CLIP

_EPS = 1e-8


class Transform(ABC):
    name: str

    @abstractmethod
    def forward(self, y: np.ndarray) -> np.ndarray: ...

    @abstractmethod
    def inverse(self, y_t: np.ndarray) -> np.ndarray: ...

    def inverse_interval(
        self, lower_t: np.ndarray, upper_t: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        return self.inverse(lower_t), self.inverse(upper_t)


class IdentityTransform(Transform):
    name = "identity"

    def forward(self, y: np.ndarray) -> np.ndarray:
        return np.asarray(y, dtype=np.float64)

    def inverse(self, y_t: np.ndarray) -> np.ndarray:
        return np.asarray(y_t, dtype=np.float64)


class LogTransform(Transform):
    """For heavy-tailed non-negative series (revenue)."""

    name = "log"

    def forward(self, y: np.ndarray) -> np.ndarray:
        return np.log(np.maximum(y, _EPS))

    def inverse(self, y_t: np.ndarray) -> np.ndarray:
        return np.exp(np.clip(y_t, -30, 30))

    def inverse_interval(
        self, lower_t: np.ndarray, upper_t: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        lo = np.exp(np.clip(lower_t, -30, 30))
        hi = np.exp(np.clip(upper_t, -30, 30))
        return np.maximum(lo, 0.0), np.maximum(hi, 0.0)


class Log1pTransform(Transform):
    """For counts that may contain zeros (bookings)."""

    name = "log1p"

    def forward(self, y: np.ndarray) -> np.ndarray:
        return np.log1p(np.maximum(y, 0.0))

    def inverse(self, y_t: np.ndarray) -> np.ndarray:
        return np.maximum(np.expm1(np.clip(y_t, -30, 30)), 0.0)

    def inverse_interval(
        self, lower_t: np.ndarray, upper_t: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        lo = np.maximum(np.expm1(np.clip(lower_t, -30, 30)), 0.0)
        hi = np.maximum(np.expm1(np.clip(upper_t, -30, 30)), 0.0)
        return lo, hi


class LogitTransform(Transform):
    """For rates bounded in (0, 1), e.g. cancel_rate."""

    name = "logit"

    def forward(self, y: np.ndarray) -> np.ndarray:
        yc = np.clip(y, CANCEL_RATE_CLIP[0], CANCEL_RATE_CLIP[1])
        return np.log(yc / (1.0 - yc))

    def inverse(self, y_t: np.ndarray) -> np.ndarray:
        s = 1.0 / (1.0 + np.exp(-np.clip(y_t, -30, 30)))
        return np.clip(s, CANCEL_RATE_CLIP[0], CANCEL_RATE_CLIP[1])

    def inverse_interval(
        self, lower_t: np.ndarray, upper_t: np.ndarray
    ) -> Tuple[np.ndarray, np.ndarray]:
        lo = self.inverse(lower_t)
        hi = self.inverse(upper_t)
        return lo, hi


_METRIC_TRANSFORMS: dict[str, Transform] = {
    "revenue": LogTransform(),
    "bookings": Log1pTransform(),
    "utilization": IdentityTransform(),
    "cancel_rate": LogitTransform(),
    "avg_check": LogTransform(),
}


def get_transform(metric: str) -> Transform:
    return _METRIC_TRANSFORMS.get(metric, IdentityTransform())
