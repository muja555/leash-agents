# Leash — single-container web app (UI + merchant + APIs on one port).
# No build step: the app runs via tsx, so runtime needs all deps.
FROM node:22-slim

WORKDIR /app

# Install deps first for layer caching (include tsx — it's the runtime here).
COPY package.json package-lock.json ./
RUN npm ci

# App source
COPY . .

ENV NODE_ENV=production
# Platforms (Render/Railway/Fly) inject PORT; config.merchant.port reads it.
EXPOSE 8080

CMD ["npm", "run", "web"]
