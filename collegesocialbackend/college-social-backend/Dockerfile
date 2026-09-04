# IAEMS backend image. See docs/DOCKER.md.
#
#   dev     -> used by docker-compose (source is bind-mounted over it, deps built in-container)
#   runtime -> the production image: slim + LibreOffice/Poppler/Arabic fonts for the file converter
#
# Build the production image:  docker build -t iaems-backend .
# (add  --target dev  for the compose image)

# ---------- builder: full toolchain for bcrypt / node-gyp + ffmpeg-static download ----------
FROM node:22-bookworm AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY .npmrc package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- dev: compose target. Lean (no office suite); converter uses the Adobe fallback ----------
FROM node:22-bookworm AS dev
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=development
EXPOSE 3001
CMD ["npm", "run", "start:dev"]

# ---------- runtime: production. node:22 slim + the converter's system deps ----------
FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress \
      poppler-utils \
      fonts-noto-core fonts-noto-cjk fonts-kacst fontconfig \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    LIBREOFFICE_PATH=/usr/bin/soffice \
    UPLOADS_DIR=/var/data/uploads
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
RUN mkdir -p /var/data/uploads && chown -R node:node /app /var/data/uploads
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3001)+'/api',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"
# ROLE=worker -> no HTTP listener, runs @Cron jobs + the BullMQ worker (see docs/DOCKER.md phase 3)
CMD ["node", "dist/main"]
