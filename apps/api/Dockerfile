FROM node:22-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@10.5.2 --activate

COPY pnpm-lock.yaml* pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @ai-reviewer/api build || true

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Run as non-root user for security hygiene
USER node

COPY --from=builder /app ./

EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]

