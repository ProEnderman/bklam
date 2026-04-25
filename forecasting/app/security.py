"""Validate internal JWT from Java backend (scope=forecast, tenant_id, exp, iss)."""
from __future__ import annotations

import base64
import os
from typing import Annotated

from fastapi import Header, HTTPException
from jose import JWTError, jwt

_DEV_ENVS = {"", "dev", "development", "local", "test"}


def _is_non_dev_environment() -> bool:
    env_name = (os.getenv("APP_ENV") or os.getenv("ENVIRONMENT") or os.getenv("PYTHON_ENV") or "").strip().lower()
    return env_name not in _DEV_ENVS


def _allow_insecure_dev_secrets() -> bool:
    return os.getenv("ALLOW_INSECURE_DEV_SECRETS", "false").strip().lower() in ("1", "true", "yes")


def _is_placeholder(value: str) -> bool:
    v = value.lower()
    return (
        "change-me" in v
        or "default-secret" in v
        or "test-secret" in v
        or "your-secret" in v
        or "dev-jwt-secret" in v
    )


def _secret_bytes() -> bytes:
    b64 = os.environ.get("FORECAST_INTERNAL_JWT_SECRET_B64", "").strip()
    if not b64:
        raise RuntimeError("FORECAST_INTERNAL_JWT_SECRET_B64 must be set")
    try:
        decoded = base64.b64decode(b64, validate=True)
    except Exception as exc:
        raise RuntimeError("FORECAST_INTERNAL_JWT_SECRET_B64 must be valid base64") from exc
    if len(decoded) < 32:
        raise RuntimeError("FORECAST_INTERNAL_JWT_SECRET_B64 must decode to at least 32 bytes")

    strict = _is_non_dev_environment() or not _allow_insecure_dev_secrets()
    if strict and _is_placeholder(b64):
        raise RuntimeError("FORECAST_INTERNAL_JWT_SECRET_B64 contains insecure placeholder value")

    return decoded


ISSUER = os.getenv("FORECAST_INTERNAL_JWT_ISSUER", "rms-backend")


def validate_internal_jwt_secret_or_raise() -> None:
    _secret_bytes()


def verify_internal_jwt(
    authorization: Annotated[str | None, Header()] = None,
) -> int | None:
    """Extract tenant_id from internal JWT. Returns None if no/invalid token."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(
            token,
            _secret_bytes(),
            algorithms=["HS256"],
            issuer=ISSUER,
        )
    except JWTError:
        return None
    if payload.get("scope") != "forecast":
        return None
    tenant_id = payload.get("tenant_id")
    if tenant_id is None:
        return None
    return int(tenant_id)


def require_internal_jwt(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> tuple[str, int]:
    """Require valid internal JWT; returns (token, tenant_id). Raises 401 if missing/invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(
            token,
            _secret_bytes(),
            algorithms=["HS256"],
            issuer=ISSUER,
        )
    except JWTError as e:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("scope") != "forecast":
        raise HTTPException(status_code=403, detail="Invalid scope")
    tenant_id = payload.get("tenant_id")
    if tenant_id is None:
        raise HTTPException(status_code=401, detail="Missing tenant_id")
    return token, int(tenant_id)
