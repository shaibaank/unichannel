# Backend image — build context is the repo root.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app

# Install with the full workspace context so pnpm can resolve the lockfile.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/backend/package.json apps/backend/package.json
RUN pnpm install --filter @omniinbox/backend... --frozen-lockfile

COPY apps/backend apps/backend
RUN pnpm --filter @omniinbox/backend exec prisma generate \
 && pnpm --filter @omniinbox/backend build

FROM node:22-alpine AS runtime
RUN corepack enable
WORKDIR /app

# Copy the resolved workspace (node_modules + built backend).
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/backend /app/apps/backend
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/

WORKDIR /app/apps/backend
ENV NODE_ENV=production
EXPOSE 3001

# Apply migrations, then start the server.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/index.js"]
