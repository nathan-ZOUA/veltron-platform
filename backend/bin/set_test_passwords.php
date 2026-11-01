<?php
declare(strict_types=1);

// Définit un mot de passe de TEST pour les comptes de démonstration (is_seed = 1).
// Usage :  php bin/set_test_passwords.php
// À ne JAMAIS utiliser en production.
require __DIR__ . '/../src/core.php';

$password = 'Veltron#2026';
$n = q('UPDATE users SET password_hash = ? WHERE is_seed = 1', [password_hash($password, PASSWORD_DEFAULT)])->rowCount();
echo "$n comptes de test mis à jour. Mot de passe de test : $password\n";
