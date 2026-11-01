# Étape 1 : Build du Frontend React (TypeScript + Vite)
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Étape 2 : Runtime PHP 8.3 (API Backend + Frontend compilé sur le même domaine)
FROM php:8.3-cli-alpine
RUN docker-php-ext-install pdo pdo_mysql

WORKDIR /app
COPY database/ ./database/
COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist/ ./backend/public/

RUN mkdir -p /app/backend/storage/docs /app/backend/public/uploads && \
    chmod -R 777 /app/backend/storage /app/backend/public/uploads

ENV APP_ENV=production
ENV SHOW_OTP_HINT=1
ENV PORT=8080

CMD ["sh", "-c", "php /app/backend/bin/boot_prod.php && php -S 0.0.0.0:${PORT:-8080} -t /app/backend/public /app/backend/public/index.php"]

