FROM python:3.14.8-slim-bookworm@sha256:48b13b003dda20b16f9442b8475aa05fe21bf6579a8c881db92ffb4d8fd20f83 AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /build

COPY backend/requirements-build.lock backend/requirements.lock ./
RUN python -m pip install --require-hashes --only-binary=:all: -r requirements-build.lock \
    && python -m pip download --no-deps --only-binary=:all: -r requirements.lock --dest /wheels

COPY backend/pyproject.toml backend/pyproject.toml
COPY backend/src/meducation_api backend/src/meducation_api
RUN python -m pip wheel --no-index --no-deps --no-build-isolation --wheel-dir /wheels ./backend \
    && python -m venv /opt/venv \
    && /opt/venv/bin/python -m pip install --no-index --no-deps --find-links=/wheels \
        -r requirements.lock /wheels/meducation_api-0.1.0-py3-none-any.whl \
    && /opt/venv/bin/python -m pip check

FROM python:3.14.8-slim-bookworm@sha256:48b13b003dda20b16f9442b8475aa05fe21bf6579a8c881db92ffb4d8fd20f83 AS runtime

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MEDUCATION_BANK_PATH=/app/content/questionBank.generated.json \
    MEDUCATION_FLASHCARD_BANK_PATH=/app/content/flashcardBank.generated.json \
    MEDUCATION_ALLOWED_ORIGINS=http://127.0.0.1:4173,http://localhost:4173

RUN groupadd --gid 10001 meducation \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin meducation
WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY backend/requirements.lock /app/requirements.lock
COPY src/content/questionBank.generated.json src/content/flashcardBank.generated.json /app/content/

USER 10001:10001
EXPOSE 8000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
    CMD python -c 'import json, urllib.request; response = urllib.request.urlopen("http://127.0.0.1:8000/health/ready", timeout=2); assert response.status == 200 and json.load(response) == {"status": "ready"}'
CMD ["python", "-m", "uvicorn", "meducation_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--timeout-graceful-shutdown", "10"]
