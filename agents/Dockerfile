# syntax=docker/dockerfile:1.7
# Agents service image (FastAPI API + worker loops). Built by deploy/docker-compose.yml.
# Only explicit paths are copied: agents/.env, .env.devnet, .venv and data/ never enter the image.
FROM ghcr.io/astral-sh/uv:latest AS uv

FROM python:3.12-slim
COPY --from=uv /uv /uvx /bin/

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH

WORKDIR /srv/agents

# Dependencies first (cached layer), then the project itself (editable install, so
# config.ROOT resolves to /srv/agents and abi/, data/, deployments/ live next to src/).
COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY src ./src
COPY abi ./abi
COPY scripts ./scripts
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

# Non-root. data/ is the SQLite volume mount point; deployments/ is bind-mounted read-only.
RUN useradd --system --uid 10001 --home-dir /srv/agents agents \
 && mkdir -p data deployments \
 && chown -R agents:agents data
USER agents

EXPOSE 8787
# --proxy-headers: Caddy is the only client that can reach this port, so trust its X-Forwarded-For
# (the API rate limiter keys on the client IP).
CMD ["uvicorn", "mra_agents.api:app", "--host", "0.0.0.0", "--port", "8787", "--proxy-headers", "--forwarded-allow-ips", "*"]
