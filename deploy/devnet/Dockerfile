# syntax=docker/dockerfile:1.7
# mra-devnet-tools: everything the devnet deployer and the default scene need, in one image.
#   foundry v1.2.2 (forge/cast/anvil; same tag as the `anvil` service), nargo 1.0.0-rc.3 + bb 6.0.0 (the pinned
#   pair circuits/business_pass/build.sh expects), Python 3.12 + the agents package (uv, frozen lock).
# Contracts and the Business Pass circuit are compiled at build time, so first boot only deploys and seeds.
# Build context is the repo root (compose: context ..); Dockerfile.dockerignore next to this file trims it.
# Layout mirrors the repo under /work, so agents/scripts/devnet.sh and bizpass.CIRCUIT_DIR resolve unchanged.
FROM ghcr.io/astral-sh/uv:latest AS uv

FROM ghcr.io/foundry-rs/foundry:v1.2.2
USER root
ARG TARGETARCH
ARG NARGO_VERSION=1.0.0-rc.3
ARG BB_VERSION=6.0.0
RUN apt-get update -qq \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ca-certificates curl libstdc++6 \
 && rm -rf /var/lib/apt/lists/*
RUN set -eux; \
    case "${TARGETARCH:-amd64}" in amd64) na=x86_64; ba=amd64 ;; arm64) na=aarch64; ba=arm64 ;; *) exit 1 ;; esac; \
    curl -fsSL "https://github.com/noir-lang/noir/releases/download/v${NARGO_VERSION}/noir-${na}-unknown-linux-gnu.tar.gz" \
      | tar -xz -C /usr/local/bin; \
    curl -fsSL "https://github.com/AztecProtocol/aztec-packages/releases/download/v${BB_VERSION}/barretenberg-${ba}-linux.tar.gz" \
      | tar -xz -C /usr/local/bin; \
    nargo --version; bb --version
COPY --from=uv /uv /uvx /bin/

ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy \
    UV_PYTHON_INSTALL_DIR=/opt/python HOME=/root
WORKDIR /work

# Python deps first (cached layer). uv fetches Python 3.12 (agents/.python-version) itself.
COPY agents/pyproject.toml agents/uv.lock agents/.python-version agents/
RUN --mount=type=cache,target=/root/.cache/uv cd agents && uv sync --frozen --no-dev --no-install-project

# Contracts (lib/ = git submodules: run `git submodule update --init --recursive` before building; deploy.sh does).
COPY contracts contracts
RUN cd contracts && forge build >/dev/null && ls out/PoolSwapTest.sol/PoolSwapTest.json out/DeployLocal.s.sol >/dev/null

COPY circuits circuits
RUN cd circuits/business_pass && nargo compile && bb write_vk -b target/business_pass.json -o target -t evm \
 && cd ../standing_pass && nargo compile && bb write_vk -b target/standing_pass.json -o target -t evm

# Package + scripts (compose bind-mounts agents/src and agents/scripts over these at runtime).
COPY agents/src agents/src
COPY agents/abi agents/abi
COPY agents/scripts agents/scripts
RUN --mount=type=cache,target=/root/.cache/uv cd agents && uv sync --frozen --no-dev \
 && mkdir -p deployments/devnet

# Runs as root on purpose: it is a one-shot job on the private network, and forge/nargo write into /work.
ENTRYPOINT []
CMD ["bash", "/srv/devnet-kit/bootstrap.sh"]
