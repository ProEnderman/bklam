# Verify Forecast Isolation and Internal JWT

Run these **3 manual commands** after `docker compose up` (with `backend` and `forecast` services) to confirm network isolation and internal JWT auth.

---

## 1) Forecast container cannot reach Postgres

The forecast service must **not** have a network path to Postgres (it uses only the Java backend API).

```bash
# From host: exec into forecast container and try to reach postgres (should fail)
docker compose exec forecast sh -c 'python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(2)
try:
    s.connect((\"postgres\", 5432))
    print(\"FAIL: postgres reachable\")
except (socket.gaierror, OSError) as e:
    print(\"OK: postgres not reachable:\", type(e).__name__)
"'
```

**Expected:** `OK: postgres not reachable: ...` (e.g. `gaierror` = hostname does not resolve).

---

## 2) Internal forecast endpoint without Authorization → 401

```bash
curl -s -o /dev/null -w "%{http_code}" "http://localhost:8080/api/internal/forecast-data/orders?from=2024-01-01&to=2024-01-31"
```

**Expected:** `401` (replace port if your backend runs elsewhere).

---

## 3) Internal forecast endpoint with valid internal JWT → 200

Obtain a short-lived internal JWT from the backend (e.g. from an endpoint that issues it for the forecast service), then call the internal API with it.

**Option A – if you have a backend endpoint that returns an internal token (e.g. for testing):**

```bash
# Example: assume GET /api/forecast/internal-token?tenantId=1 returns { "token": "..." }
TOKEN=$(curl -s "http://localhost:8080/api/forecast/internal-token?tenantId=1" | jq -r '.token')
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8080/api/internal/forecast-data/orders?from=2024-01-01&to=2024-01-31"
```

**Option B – one-off token via Java (e.g. in backend container or local run):**

Use the same secret as `FORECAST_INTERNAL_JWT_SECRET_B64` and issue a JWT with claims: `iss=rms-backend`, `scope=forecast`, `tenant_id=<id>`, plus `exp`/`iat`. Then:

```bash
curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer <INTERNAL_JWT>" \
  "http://localhost:8080/api/internal/forecast-data/orders?from=2024-01-01&to=2024-01-31"
```

**Expected:** `200`.

---

## Summary

| Check                         | Command / action                          | Expected  |
|------------------------------|-------------------------------------------|-----------|
| Forecast cannot reach Postgres | Exec into forecast, try connect to postgres | Not reachable |
| No auth → internal endpoint   | `curl` without `Authorization`            | 401       |
| Valid internal JWT → internal endpoint | `curl` with `Authorization: Bearer <token>` | 200   |
