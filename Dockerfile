# Étape 1 : Build du Frontend React (TypeScript + Vite)
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Étape 2 : Runtime PHP 8.3 + MariaDB autonome (Support déploiement 100% autonome ou MySQL externe)
FROM php:8.3-cli-alpine
RUN apk add --no-cache mariadb mariadb-client bash dos2unix \
    && docker-php-ext-install pdo pdo_mysql

WORKDIR /app
COPY database/ ./database/
COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist/ ./backend/public/
COPY scripts/entrypoint.sh /app/entrypoint.sh
RUN dos2unix /app/entrypoint.sh && chmod +x /app/entrypoint.sh

RUN mkdir -p /app/backend/storage/docs /app/backend/public/uploads /var/lib/mysql /run/mysqld \
    && chown -R mysql:mysql /var/lib/mysql /run/mysqld \
    && chmod -R 777 /app/backend/storage /app/backend/public/uploads

ENV APP_ENV=production
ENV SHOW_OTP_HINT=1
ENV PORT=10000

EXPOSE 10000 8080

ENTRYPOINT ["/app/entrypoint.sh"]
