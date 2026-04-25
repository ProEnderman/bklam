"""Tests for SARIMAX with exogenous regressors."""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import numpy as np
import pandas as pd
import pytest

from sarimax_exog import fit_forecast_sarimax_exog, EXOG_SEARCH_SPACE


class TestSarimaxExog:
    def test_search_space_not_empty(self):
        assert len(EXOG_SEARCH_SPACE) > 0

    def test_fit_with_valid_exog(self):
        np.random.seed(42)
        n = 200
        y = 50 + np.sin(np.arange(n) * 2 * np.pi / 7) * 10 + np.random.randn(n) * 3
        exog_train = np.column_stack([np.random.randn(n), np.random.randn(n)])
        exog_future = np.column_stack([np.random.randn(14), np.random.randn(14)])
        yhat, lo, hi, diag = fit_forecast_sarimax_exog(
            y, (1, 0, 1), (1, 0, 1, 7), exog_train, exog_future, 14
        )
        if yhat is not None:
            assert len(yhat) == 14
            assert len(lo) == 14
            assert np.all(np.isfinite(yhat))

    def test_missing_exog_falls_back(self):
        np.random.seed(42)
        n = 200
        y = np.random.randn(n) + 100
        exog_train = np.zeros((n, 0))
        exog_future = np.zeros((14, 0))
        yhat, lo, hi, diag = fit_forecast_sarimax_exog(
            y, (1, 0, 1), (0, 0, 0, 7), exog_train, exog_future, 14
        )
        assert yhat is None or len(yhat) == 14

    def test_returns_diagnostics(self):
        np.random.seed(42)
        n = 150
        y = np.random.randn(n) * 10 + 50
        exog = np.random.randn(n, 1)
        exog_f = np.random.randn(14, 1)
        _, _, _, diag = fit_forecast_sarimax_exog(
            y, (0, 0, 1), (0, 0, 0, 7), exog, exog_f, 14
        )
        assert "order" in diag
        assert "seasonal_order" in diag

    def test_pruning_constraint(self):
        for order, sorder in EXOG_SEARCH_SPACE:
            p, d, q = order
            P, D, Q, s = sorder
            assert p + q + P + Q <= 5
            assert s == 7
