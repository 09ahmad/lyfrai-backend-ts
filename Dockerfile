FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS deps

# Install build toolchain for better-sqlite3 (node-gyp needs Python, make, C++ compiler)
RUN apt-get update && \
    apt-get install -y python3 make g++ curl && \
    ln -sf /usr/bin/python3 /usr/bin/python && \
    rm -rf /var/lib/apt/lists/*

COPY bun.lock package.json tsconfig.json ./
RUN bun install --ci

FROM base AS app
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
COPY . .
EXPOSE 8000
ENV PORT=8000
CMD ["bun", "run", "app/main.ts"]

