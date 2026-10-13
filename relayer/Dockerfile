# Imprest relayer image (used by Railway via railway.json). Build context: the repository root.
#   docker build -f relayer/Dockerfile -t imprest-relayer .
# Secrets are never baked in: RELAYER_PRIVATE_KEY is supplied by the host at runtime.
FROM node:22.20.0-bookworm-slim

WORKDIR /repo
ENV CI=true
RUN corepack enable

# .dockerignore keeps only the workspace manifests, the lockfile, config/, packages/ and relayer/.
COPY . .
# Only the relayer and its workspace dependency (@imprest/core). NODE_ENV is not production yet, so
# tsx (a devDependency that runs the TypeScript entry point) is installed.
RUN pnpm install --frozen-lockfile --filter "@imprest/relayer..."

ENV NODE_ENV=production
ENV HOST=0.0.0.0
WORKDIR /repo/relayer
USER node
EXPOSE 8787
# No pnpm at runtime: node runs the entry point through tsx directly.
CMD ["node", "--import", "tsx", "src/node.ts"]
