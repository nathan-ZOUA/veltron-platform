#!/bin/sh
set -e

# ==============================================================================
# VELTRON Platform Entrypoint (Support 100% autonome ou Base de données distante)
# ==============================================================================

# Si aucune variable de base de données distante n'est fournie, démarrer MariaDB local
if [ -z "$MYSQL_URL" ] && [ -z "$DATABASE_URL" ] && [ -z "$MYSQLHOST" ] && [ -z "$DB_HOST" ]; then
    echo "[entrypoint] Aucune base MySQL distante détectée."
    echo "[entrypoint] Démarrage du moteur MariaDB local intégré..."

    if [ ! -d "/var/lib/mysql/mysql" ]; then
        echo "[entrypoint] Initialisation de la base de données MariaDB..."
        mariadb-install-db --user=mysql --datadir=/var/lib/mysql > /dev/null 2>&1
    fi

    # Lancement du démon MariaDB en arrière-plan
    mariadbd-safe --datadir='/var/lib/mysql' --nowatch > /dev/null 2>&1 &

    # Attente active que MariaDB soit opérationnel (max 30 secondes)
    echo "[entrypoint] En attente de MariaDB..."
    for i in $(seq 1 30); do
        if mariadb-admin ping --silent > /dev/null 2>&1; then
            echo "[entrypoint] MariaDB local est prêt !"
            break
        fi
        sleep 1
    done
else
    echo "[entrypoint] Connexion à la base MySQL distante configurée..."
fi

# Initialisation du schéma, des données géographiques, agences et super admin
echo "[entrypoint] Initialisation et migrations VELTRON (boot_prod.php)..."
php /app/backend/bin/boot_prod.php

# Démarrage du serveur Web PHP sur le port attribué par Render ($PORT ou 10000)
PORT_TO_USE="${PORT:-10000}"
echo "[entrypoint] Démarrage du serveur Web VELTRON sur http://0.0.0.0:${PORT_TO_USE}..."
exec php -S 0.0.0.0:${PORT_TO_USE} -t /app/backend/public /app/backend/public/index.php
