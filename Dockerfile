FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

# Informational only - the app actually listens on $PORT (main.ts), which
# docker-compose.yml maps at runtime. Update both if you change the default.
EXPOSE 3000

# Checks /health (see HealthController), which itself pings Postgres - a
# 200 here means the app can actually serve, not just that node is running.
# start-period gives it time to connect + run migrations on first boot.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main.js"]
