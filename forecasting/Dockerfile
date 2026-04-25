# Python 3.11 — keep in sync with CI (.github/workflows/ci.yml setup-python)
FROM python:3.11-slim
WORKDIR /app
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt .
RUN python -m pip install --no-cache-dir --upgrade "pip>=24.0,<25" \
    && python -m pip install --no-cache-dir -r requirements.txt
COPY . .
# No DATABASE_URL / POSTGRES_* — data only via JAVA_BACKEND_URL
ENV PYTHONUNBUFFERED=1
EXPOSE 8090
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8090"]
