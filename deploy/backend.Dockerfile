# Debian slim rather than Alpine: Prisma's engines and sharp both ship prebuilt
# for glibc, and Prisma needs OpenSSL, which Alpine lacks by default.
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

COPY backend/package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

COPY backend/prisma ./prisma
RUN node_modules/.bin/prisma generate

COPY backend/src ./src

# Local uploads (STORAGE_DRIVER=local) and multer's temp files; with S3 the
# files only pass through here on their way to the bucket.
RUN mkdir -p uploads && chown -R node:node /app
USER node

EXPOSE 4000

# Brings the database schema up to date, then hands PID 1 to node so it gets
# SIGTERM directly and shuts down cleanly. db push refuses changes that would
# drop data unless told otherwise, so a bad deploy stops here instead.
CMD ["sh", "-c", "node_modules/.bin/prisma db push --skip-generate && exec node src/server.js"]
