# Debian-based, NOT Alpine: node-canvas prebuilds target glibc, and building
# from source on musl is a long-tail source of failures (spec §12.1).
FROM node:22-bookworm-slim

# node-canvas runtime and build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
      libcairo2-dev \
      libpango1.0-dev \
      libjpeg-dev \
      libgif-dev \
      librsvg2-dev \
      build-essential \
      python3 \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/design-core/package.json packages/design-core/
COPY packages/design-fabric/package.json packages/design-fabric/

# pnpm-workspace.yaml declares onlyBuiltDependencies + allowBuilds for
# `canvas`, so its native build script runs non-interactively without
# --unsafe-perm. That approval file must be copied in above, before install.
RUN pnpm install --frozen-lockfile

COPY . .

# fail the build immediately if the native module did not link.
# canvas is a dependency of @kreart/design-fabric, not of the workspace
# root, so pnpm's isolated node_modules does not hoist it to /app -
# the check must run from the package that actually depends on it.
RUN cd packages/design-fabric && node -e "require('canvas').createCanvas(1,1); console.log('node-canvas OK')"

CMD ["pnpm", "vitest", "run"]
