# Build context: repo root (see docker-compose.yml)
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/engine/package.json packages/engine/
COPY packages/data/package.json packages/data/
RUN npm ci --workspace @avm/server --include-workspace-root=false
COPY tsconfig.base.json ./
COPY config ./config
COPY packages ./packages
COPY apps/server ./apps/server
ENV NODE_ENV=production PORT=4000 HOST=0.0.0.0
EXPOSE 4000
CMD ["npm", "start", "-w", "@avm/server"]
