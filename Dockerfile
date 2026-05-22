FROM node:20-alpine AS builder
WORKDIR /app

# OpenSSL is required by the Prisma engine on alpine.
RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
# --ignore-scripts skips `postinstall` (which would call `prisma generate` before
# the schema is copied). We invoke generate explicitly below once the schema is in place.
RUN npm install --no-audit --no-fund --ignore-scripts

COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

RUN apk add --no-cache openssl
RUN addgroup -S app && adduser -S app -G app

# Pull in compiled output and the full node_modules (incl. prisma CLI for
# `migrate deploy` on boot). Chown so the unprivileged user can read/exec.
COPY --chown=app:app --from=builder /app/node_modules ./node_modules
COPY --chown=app:app --from=builder /app/dist ./dist
COPY --chown=app:app --from=builder /app/prisma ./prisma
COPY --chown=app:app package.json ./

USER app
EXPOSE 3000

# Apply committed migrations on boot, then start the server.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/server.js"]
