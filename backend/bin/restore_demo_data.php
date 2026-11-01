<?php
declare(strict_types=1);

// =============================================================================
// Restauration de toutes les données de test / démonstration pour VELTRON
// =============================================================================

require __DIR__ . '/../src/core.php';

function split_sql_local(string $sql): array
{
    $lines = preg_split('/\R/', $sql) ?: [];
    $clean = [];
    foreach ($lines as $line) {
        $trim = ltrim($line);
        if ($trim === '' || str_starts_with($trim, '--')) continue;
        $clean[] = $line;
    }
    $text = implode("\n", $clean);

    $statements = [];
    $buf = '';
    $inSingle = false;
    $len = strlen($text);
    for ($i = 0; $i < $len; $i++) {
        $ch = $text[$i];
        if (!$inSingle && $ch === '-' && ($i + 1 < $len) && $text[$i + 1] === '-') {
            while ($i < $len && $text[$i] !== "\n") $i++;
            $buf .= "\n";
            continue;
        }
        if ($ch === "'") {
            if ($inSingle && ($i + 1 < $len) && $text[$i + 1] === "'") {
                $buf .= "''";
                $i++;
                continue;
            }
            $inSingle = !$inSingle;
            $buf .= $ch;
        } elseif ($ch === ';' && !$inSingle) {
            $stmt = trim($buf);
            if ($stmt !== '') $statements[] = $stmt;
            $buf = '';
        } else {
            $buf .= $ch;
        }
    }
    if (trim($buf) !== '') $statements[] = trim($buf);
    return $statements;
}

$cfg = db_config();
$pdo = new PDO(
    sprintf('mysql:host=%s;port=%s;charset=utf8mb4', $cfg['host'], $cfg['port']),
    $cfg['user'],
    $cfg['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
$pdo->exec("SET NAMES utf8mb4");

$dbDir = realpath(__DIR__ . '/../../database');

echo "[restore] 1. Chargement de schema.sql...\n";
$schemaSql = file_get_contents($dbDir . '/schema.sql');
foreach (split_sql_local($schemaSql) as $s) {
    $pdo->exec($s);
}

echo "[restore] 2. Chargement de seed.sql (agences, bus, lignes, départs, chauffeurs)...\n";
$seedSql = file_get_contents($dbDir . '/seed.sql');
foreach (split_sql_local($seedSql) as $s) {
    $pdo->exec($s);
}

echo "[restore] 3. Chargement de world_countries.sql...\n";
$countriesSql = file_get_contents($dbDir . '/world_countries.sql');
foreach (split_sql_local($countriesSql) as $s) {
    $pdo->exec($s);
}

echo "[restore] 4. Actualisation des départs dans le futur (refresh_trips.sql)...\n";
$refreshSql = file_get_contents($dbDir . '/refresh_trips.sql');
foreach (split_sql_local($refreshSql) as $s) {
    $pdo->exec($s);
}

echo "[restore] 5. Configuration des mots de passe démo (Veltron#2026)...\n";
$defaultPass = 'Veltron#2026';
$algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
$hash = password_hash($defaultPass, $algo);
$pdo->exec("UPDATE veltron.users SET password_hash = '$hash' WHERE is_seed = 1");

echo "[restore] 6. Création du compte Responsable Propriétaire (Nathan Zoua, najnathan23@gmail.com)...\n";
$ownerEmail = 'najnathan23@gmail.com';
$ownerPass = env('OWNER_PASSWORD', $defaultPass);
$ownerHash = password_hash($ownerPass, $algo);
$stmt = $pdo->prepare("INSERT INTO veltron.users (email, password_hash, first_name, last_name, locale, platform_role, is_seed)
                       VALUES (?, ?, 'Nathan', 'ZOUA', 'fr', 'super_admin', 0)
                       ON DUPLICATE KEY UPDATE platform_role = 'super_admin'");
$stmt->execute([$ownerEmail, $ownerHash]);

// Configuration des 3 modes de réception par défaut du responsable
$stmtSetting = $pdo->prepare("INSERT INTO veltron.platform_settings (k, v) VALUES (?, ?)
                             ON DUPLICATE KEY UPDATE v = VALUES(v)");
$stmtSetting->execute(['owner_payout_method', 'orange_money']);
$stmtSetting->execute(['owner_payout_name', 'Nathan Zoua (Propriétaire VELTRON)']);
$stmtSetting->execute(['owner_orange_number', '+237 690 00 00 00']);
$stmtSetting->execute(['owner_orange_name', 'Nathan Zoua']);
$stmtSetting->execute(['owner_mtn_number', '+237 670 00 00 00']);
$stmtSetting->execute(['owner_mtn_name', 'Nathan Zoua']);
$stmtSetting->execute(['owner_bank_name', 'Afriland First Bank']);
$stmtSetting->execute(['owner_bank_iban', 'CM21 10005 00001 12345678901 23']);
$stmtSetting->execute(['owner_bank_holder', 'Nathan Zoua']);
$stmtSetting->execute(['password_customized', '0']);

// Ajouter des méthodes de paiement de test pour les passagers de test (passager1, passager2)
$pdo->exec("INSERT INTO veltron.passenger_payment_methods (user_id, provider, account_number, account_holder, balance, currency_code, is_default)
            VALUES (12, 'orange_money', '+237 699 12 34 56', 'Client Test Un', 150000, 'XAF', 1),
                   (12, 'mtn_momo', '+237 677 88 99 00', 'Client Test Un', 85000, 'XAF', 0),
                   (12, 'bank_transfer', 'CM21 10005 00001 98765432109 87', 'Client Test Un', 500000, 'XAF', 0),
                   (13, 'mtn_momo', '+221 77 123 45 67', 'Client Test Deux', 120000, 'XOF', 1)
            ON DUPLICATE KEY UPDATE balance = VALUES(balance)");

// Configurer les comptes de réception par défaut des agences de test
$pdo->exec("UPDATE veltron.agencies SET
            payout_method = 'orange_money',
            payout_account_number = '+237 699 00 11 22',
            payout_account_name = 'Agence Équateur Voyages SA',
            wallet_balance = 2450000
            WHERE id = 1");

$pdo->exec("UPDATE veltron.agencies SET
            payout_method = 'wave',
            payout_account_number = '+221 77 000 11 22',
            payout_account_name = 'Baobab Lines SARL',
            wallet_balance = 1800000
            WHERE id = 2");

$pdo->exec("UPDATE veltron.agencies SET
            payout_method = 'bank_transfer',
            payout_account_number = 'FR76 3000 4000 5000 6000 7000 890',
            payout_account_name = 'Rhône Cars SAS',
            wallet_balance = 8500
            WHERE id = 3");

echo "[restore] Succès : Base VELTRON rechargée avec toutes les agences, départs et comptes de démonstration !\n";
