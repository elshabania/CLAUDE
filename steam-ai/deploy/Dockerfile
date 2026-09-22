# Multi-stage build: frontend, then backend serving the built app.
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.11-slim
WORKDIR /app
COPY backend/ /app/backend/
COPY config/ /app/config/
COPY --from=web /web/dist /app/frontend/dist
RUN pip install --no-cache-dir /app/backend
ENV STEAM_AI_DATA=/data STEAM_AI_CONFIG=/app/config STEAM_AI_FRONTEND=/app/frontend/dist
VOLUME ["/data"]
EXPOSE 8000
CMD ["steam-ai", "serve", "--host", "0.0.0.0", "--port", "8000"]
