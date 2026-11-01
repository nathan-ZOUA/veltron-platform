#!/bin/sh
# Remet la base de test dans son état initial (schéma + données de test + mots de passe de test).
# À lancer avant chaque exécution de tests/smoke.py.
# Adapter l'option -u / -p de mysql si besoin.
set -e
cd "$(dirname "$0")/../.."
mysql -u root -e "DROP DATABASE IF EXISTS veltron"
mysql -u root < database/schema.sql
mysql -u root < database/seed.sql
php backend/bin/set_test_passwords.php
