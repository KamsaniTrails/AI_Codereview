FROM node:22-bullseye-slim AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.5.2 --activate

COPY pnpm-lock.yaml* pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/

RUN pnpm install --frozen-lockfile || pnpm install

# Production worker container with Git, Python, Bandit, Ruff, and Semgrep
FROM node:22-bullseye-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Install git, python3, pip
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    python3 \
    python3-pip \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install Bandit and Ruff for Python static analysis
RUN pip3 install --no-cache-dir bandit ruff semgrep || true

# Non-root user setup
RUN useradd -m -u 1001 appuser
USER appuser

COPY --from=builder --chown=appuser:appuser /app ./

CMD ["node", "apps/worker/dist/index.js"]

