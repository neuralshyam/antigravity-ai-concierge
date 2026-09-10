# Standalone Antigravity AI Concierge Bun Engine Dockerfile
FROM oven/bun:1.2-alpine AS builder

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

COPY . .

# Compile self-contained standalone binary
RUN bun run compile

# Lightweight minimal runtime container
FROM oven/bun:1.2-alpine AS runner

WORKDIR /app

# Copy compiled binary
COPY --from=builder /app/bin/concierge-core /app/concierge-core

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["/app/concierge-core"]
