FROM oven/bun:1 AS base
WORKDIR /app


FROM base AS prepare
RUN bun add --global turbo@^2

COPY . .
RUN turbo prune @flicker/workers --docker


FROM base AS builder
COPY --from=prepare /app/out/json/ .
RUN bun install --frozen-lockfile

COPY --from=prepare /app/out/full/ .
RUN bun run turbo build


FROM base AS runner
RUN chown -R bun:bun /app

USER bun

COPY --chown=bun:bun --from=builder /app/apps/workers/dist/index.js ./index.js
CMD ["bun", "run", "index.js"]
