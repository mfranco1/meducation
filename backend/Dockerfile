FROM node:24.22.2-trixie-slim@sha256:0820eaa85e07d0490446dd01d14707e17e6108a36988cf374899cd057eb3812d AS policy
WORKDIR /policy
COPY package.json package-lock.json ./
RUN npm ci
COPY src/content ./src/content
COPY src/domain ./src/domain
COPY scripts/content ./scripts/content
RUN npm run build:content-policy

FROM python:3.14.10-slim-trixie@sha256:9aaa474097d094040649f2162a627c0049b408f52138d980916788d80f04802f AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /build

COPY backend/requirements-build.lock backend/requirements.lock ./
RUN python -m pip install --require-hashes --only-binary=:all: -r requirements-build.lock \
    && python -m pip download --no-deps --only-binary=:all: -r requirements.lock --dest /wheels

COPY backend/pyproject.toml backend/pyproject.toml
COPY backend/src/meducation_api backend/src/meducation_api
COPY --from=policy /policy/backend/src/meducation_api/content_policy/worker.mjs /policy/backend/src/meducation_api/content_policy/limits.json backend/src/meducation_api/content_policy/
RUN python -m pip wheel --no-index --no-deps --no-build-isolation --wheel-dir /wheels ./backend \
    && python -m venv /opt/venv \
    && /opt/venv/bin/python -m pip install --no-index --no-deps --find-links=/wheels \
        -r requirements.lock /wheels/meducation_api-0.1.0-py3-none-any.whl \
    && /opt/venv/bin/python -m pip check

FROM python:3.14.10-slim-trixie@sha256:9aaa474097d094040649f2162a627c0049b408f52138d980916788d80f04802f AS runtime

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN groupadd --gid 10001 meducation \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin meducation
WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --from=policy /usr/local/bin/node /usr/local/bin/node

USER 10001:10001
EXPOSE 8000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
    CMD python -c 'import json, urllib.request; response = urllib.request.urlopen("http://127.0.0.1:8000/health/ready", timeout=2); assert response.status == 200 and json.load(response) == {"status": "ready"}'
CMD ["python", "-m", "uvicorn", "meducation_api.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-proxy-headers", "--timeout-graceful-shutdown", "10"]
