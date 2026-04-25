"""Request-scoped context for internal JWT (token + tenant_id). Set by auth dependency, read by repository."""
from __future__ import annotations

from contextvars import ContextVar
from typing import Optional, Tuple

_ctx: ContextVar[Optional[Tuple[str, int]]] = ContextVar("forecast_request_context", default=None)


def set_forecast_context(token: str, tenant_id: int) -> None:
    _ctx.set((token, tenant_id))


def get_forecast_token() -> Optional[str]:
    v = _ctx.get()
    return v[0] if v else None


def get_forecast_tenant_id() -> Optional[int]:
    v = _ctx.get()
    return v[1] if v else None


def clear_forecast_context() -> None:
    try:
        _ctx.set(None)
    except LookupError:
        pass
