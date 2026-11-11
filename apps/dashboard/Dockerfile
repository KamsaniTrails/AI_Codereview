FROM node:22-alpine AS builder

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.5.2 --activate

COPY pnpm-lock.yaml* pnpm-workspace.yaml package.json ./
COPY packages/core/ ./packages/core/
COPY apps/dashboard/ ./apps/dashboard/

RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @ai-reviewer/dashboard build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/dashboard/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

