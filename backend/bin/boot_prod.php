<?php
declare(strict_types=1);

// =============================================================================
// Initialisation & Nettoyage Production de la base MySQL VELTRON :
//  - Crée les tables (schema.sql) si la base est vide
//  - Charge les 212 pays & devises (world_countries.sql) et le référentiel de villes
//  - Supprime TOUTES les données de test/démo (is_seed = 1)
//  - Crée/met à jour le compte Propriétaire VELTRON (is_seed = 0, super_admin)
// =============================================================================

require __DIR__ . '/../src/core.php';

function split_sql_prod(string $sql): array
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
$pdo = null;
for ($attempt = 1; $attempt <= 25; $attempt++) {
    try {
        $dsnNoDb = sprintf('mysql:host=%s;port=%s;charset=utf8mb4', $cfg['host'], $cfg['port']);
        $pdo = new PDO($dsnNoDb, $cfg['user'], $cfg['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        break;
    } catch (Throwable $e) {
        echo "[boot_prod] En attente de MySQL ({$cfg['host']}:{$cfg['port']}) essai $attempt/25 : {$e->getMessage()}\n";
        sleep(2);
    }
}
if (!$pdo) {
    fwrite(STDERR, "[boot_prod] Impossible de se connecter à MySQL.\n");
    exit(1);
}

$dbName = preg_replace('/[^a-zA-Z0-9_]/', '', $cfg['name']) ?: 'veltron';
$pdo->exec("CREATE DATABASE IF NOT EXISTS `$dbName` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
$pdo->exec("USE `$dbName`");
$pdo->exec("SET NAMES utf8mb4");

$hasTables = (bool) $pdo->query("SHOW TABLES LIKE 'agencies'")->fetch();
$dbDir = realpath(__DIR__ . '/../../database');

if (!$hasTables) {
    echo "[boot_prod] Création du schéma initial dans `$dbName`...\n";
    $schemaSql = file_get_contents($dbDir . DIRECTORY_SEPARATOR . 'schema.sql');
    foreach (split_sql_prod($schemaSql) as $stmt) {
        if (preg_match('/^(DROP\s+DATABASE|CREATE\s+DATABASE|USE\s+)/i', $stmt)) continue;
        $pdo->exec($stmt);
    }
}

// S'assurer que les agences, gares et départs sont pré-remplis
$hasAgencies = false;
try {
    $hasAgencies = (bool) $pdo->query("SELECT id FROM agencies LIMIT 1")->fetch();
} catch (Throwable) {}

if (!$hasAgencies && file_exists($dbDir . DIRECTORY_SEPARATOR . 'seed.sql')) {
    echo "[boot_prod] Initialisation des agences, flottes et départs (seed.sql)...\n";
    $seedSql = file_get_contents($dbDir . DIRECTORY_SEPARATOR . 'seed.sql');
    foreach (split_sql_prod($seedSql) as $stmt) {
        if (preg_match('/^(DROP\s+DATABASE|CREATE\s+DATABASE|USE\s+)/i', $stmt)) continue;
        try { $pdo->exec($stmt); } catch (Throwable) {}
    }
}

// =============================================================================
// MIGRATIONS AUTOMATIQUES & INDEX HAUTE CAPACITÉ (2 000 000+ CONNEXIONS)
// =============================================================================
$migrations = [
    "ALTER TABLE agencies ADD COLUMN IF NOT EXISTS payout_method VARCHAR(40) NOT NULL DEFAULT 'orange_money'",
    "ALTER TABLE agencies ADD COLUMN IF NOT EXISTS payout_account_number VARCHAR(80) NULL",
    "ALTER TABLE agencies ADD COLUMN IF NOT EXISTS payout_account_name VARCHAR(120) NULL",
    "ALTER TABLE agencies ADD COLUMN IF NOT EXISTS wallet_balance BIGINT UNSIGNED NOT NULL DEFAULT 0",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_account VARCHAR(80) NULL",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS agency_payout_account VARCHAR(80) NULL",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS agency_net_amount INT UNSIGNED NOT NULL DEFAULT 0",
    "ALTER TABLE payments ADD COLUMN IF NOT EXISTS platform_fee_amount INT UNSIGNED NOT NULL DEFAULT 0",
    "CREATE TABLE IF NOT EXISTS passenger_payment_methods (
        id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id        BIGINT UNSIGNED NOT NULL,
        provider       VARCHAR(40) NOT NULL DEFAULT 'orange_money',
        account_number VARCHAR(80) NOT NULL,
        account_holder VARCHAR(120) NOT NULL,
        balance        BIGINT UNSIGNED NOT NULL DEFAULT 500000,
        currency_code  CHAR(3) NOT NULL DEFAULT 'XAF',
        is_default     TINYINT(1) NOT NULL DEFAULT 1,
        created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_ppm_user (user_id, is_default),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB",
    "CREATE TABLE IF NOT EXISTS platform_settings (
        k          VARCHAR(64) PRIMARY KEY,
        v          TEXT NOT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB",
];
foreach ($migrations as $m) {
    try { $pdo->exec($m); } catch (Throwable) {}
}

// Ajout idempotent des colonnes si MySQL 8 ne supporte pas ADD COLUMN IF NOT EXISTS
$alterCols = [
    ['agencies', 'payout_method', "VARCHAR(40) NOT NULL DEFAULT 'orange_money'"],
    ['agencies', 'payout_account_number', "VARCHAR(80) NULL"],
    ['agencies', 'payout_account_name', "VARCHAR(120) NULL"],
    ['agencies', 'wallet_balance', "BIGINT UNSIGNED NOT NULL DEFAULT 0"],
    ['payments', 'payer_account', "VARCHAR(80) NULL"],
    ['payments', 'agency_payout_account', "VARCHAR(80) NULL"],
    ['payments', 'agency_net_amount', "INT UNSIGNED NOT NULL DEFAULT 0"],
    ['payments', 'platform_fee_amount', "INT UNSIGNED NOT NULL DEFAULT 0"],
];
foreach ($alterCols as [$tbl, $col, $def]) {
    $exists = $pdo->query("SHOW COLUMNS FROM `$tbl` LIKE '$col'")->fetch();
    if (!$exists) {
        $pdo->exec("ALTER TABLE `$tbl` ADD COLUMN `$col` $def");
    }
}

// Index composites haute performance (support 2M+ utilisateurs simultanés)
$highScaleIndexes = [
    ['agencies', 'idx_agencies_status_country', '(status, country_id)'],
    ['trips', 'idx_trips_scale', '(status, departs_at, agency_id, route_id)'],
    ['bookings', 'idx_bookings_user', '(user_id, status, created_at)'],
    ['bookings', 'idx_bookings_agency', '(agency_id, status, created_at)'],
    ['tickets', 'idx_tickets_scale', '(trip_id, status, seat_id)'],
    ['payments', 'idx_payments_booking', '(booking_id, status, created_at)'],
    ['sessions', 'idx_sessions_active', '(token_hash, realm, revoked_at, expires_at)'],
    ['chat_messages', 'idx_chat_msg_scale', '(group_id, id)'],
    ['rate_limits', 'idx_rl_window', '(window_start)'],
];
foreach ($highScaleIndexes as [$tbl, $idxName, $cols]) {
    $hasIdx = $pdo->query("SHOW INDEX FROM `$tbl` WHERE Key_name = '$idxName'")->fetch();
    if (!$hasIdx) {
        try { $pdo->exec("ALTER TABLE `$tbl` ADD INDEX `$idxName` $cols"); } catch (Throwable) {}
    }
}

// Optimisation moteur MySQL / InnoDB haute charge
$tunings = [
    "SET GLOBAL max_connections = 2000",
    "SET GLOBAL thread_cache_size = 128",
    "SET GLOBAL table_open_cache = 4000",
    "SET GLOBAL innodb_flush_log_at_trx_commit = 2",
    "SET GLOBAL innodb_lock_wait_timeout = 15",
];
foreach ($tunings as $t) {
    try { $pdo->exec($t); } catch (Throwable) {}
}

// Toujours s'assurer que les devises de base et les 212 pays du monde sont présents
$pdo->exec("INSERT INTO currencies (code, name, symbol, minor_units) VALUES
  ('XAF', 'Franc CFA (CEMAC)', 'FCFA', 0),
  ('XOF', 'Franc CFA (UEMOA)', 'FCFA', 0),
  ('EUR', 'Euro', '€', 2),
  ('USD', 'Dollar américain', '$', 2)
  ON DUPLICATE KEY UPDATE name = VALUES(name), symbol = VALUES(symbol), minor_units = VALUES(minor_units)");

$worldSql = file_get_contents($dbDir . DIRECTORY_SEPARATOR . 'world_countries.sql');
foreach (split_sql_prod($worldSql) as $stmt) {
    if (preg_match('/^USE\s+/i', $stmt)) continue;
    $pdo->exec($stmt);
}

// S'assurer que les principales villes de référence existent
$refCities = [
    ['CM', 'Douala', 'Africa/Douala', 4.051100, 9.767900],
    ['CM', 'Yaoundé', 'Africa/Douala', 3.848000, 11.502100],
    ['CM', 'Bafoussam', 'Africa/Douala', 5.473700, 10.417900],
    ['CM', 'Kribi', 'Africa/Douala', 2.940000, 9.910000],
    ['CM', 'Limbé', 'Africa/Douala', 4.024000, 9.202000],
    ['CM', 'Bertoua', 'Africa/Douala', 4.577200, 13.684700],
    ['CM', 'Garoua', 'Africa/Douala', 9.301400, 13.397700],
    ['SN', 'Dakar', 'Africa/Dakar', 14.716700, -17.467700],
    ['SN', 'Thiès', 'Africa/Dakar', 14.791000, -16.935900],
    ['SN', 'Saint-Louis', 'Africa/Dakar', 16.017900, -16.489600],
    ['SN', 'Touba', 'Africa/Dakar', 14.850000, -15.883300],
    ['CI', 'Abidjan', 'Africa/Abidjan', 5.360000, -4.008300],
    ['CI', 'Yamoussoukro', 'Africa/Abidjan', 6.827600, -5.289300],
    ['CI', 'Bouaké', 'Africa/Abidjan', 7.690600, -5.030000],
    ['FR', 'Paris', 'Europe/Paris', 48.856600, 2.352200],
    ['FR', 'Lyon', 'Europe/Paris', 45.764000, 4.835700],
    ['FR', 'Marseille', 'Europe/Paris', 43.296500, 5.369800],
];
$stmtCity = $pdo->prepare("INSERT IGNORE INTO cities (country_id, name, timezone, lat, lng)
                           SELECT id, ?, ?, ?, ? FROM countries WHERE iso2 = ? LIMIT 1");
foreach ($refCities as [$iso2, $cName, $tz, $lat, $lng]) {
    $stmtCity->execute([$cName, $tz, $lat, $lng, $iso2]);
}

// =============================================================================
// PURGE CONDITIONNELLE DES DONNÉES DE TEST (UNIQUEMENT SI PURGE_SEED=1)
// =============================================================================
if (env('PURGE_SEED', '0') === '1') {
    echo "[boot_prod] Suppression de toutes les données de test (is_seed = 1)...\n";
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 0");

    // Supprimer toutes les données rattachées aux agences ou comptes de test (is_seed = 1)
    $seedAgencies = "SELECT id FROM agencies WHERE is_seed = 1";
    $seedTrips    = "SELECT id FROM trips WHERE agency_id IN ($seedAgencies)";
    $seedBookings = "SELECT id FROM bookings WHERE agency_id IN ($seedAgencies)";
    $seedTickets  = "SELECT id FROM tickets WHERE trip_id IN ($seedTrips) OR booking_id IN ($seedBookings)";

    $pdo->exec("DELETE FROM ticket_transfers WHERE from_trip_id IN ($seedTrips) OR to_trip_id IN ($seedTrips)");
    $pdo->exec("DELETE FROM platform_commissions WHERE agency_id IN ($seedAgencies) OR trip_id IN ($seedTrips)");
    $pdo->exec("DELETE FROM trip_status_updates WHERE trip_id IN ($seedTrips)");
    $pdo->exec("DELETE FROM trip_driver_changes WHERE trip_id IN ($seedTrips)");
    $pdo->exec("DELETE FROM trip_drivers WHERE trip_id IN ($seedTrips)");
    $pdo->exec("DELETE FROM reviews WHERE is_seed = 1 OR agency_id IN ($seedAgencies)");
    $pdo->exec("DELETE FROM luggage WHERE ticket_id IN ($seedTickets)");
    $pdo->exec("DELETE FROM refunds WHERE ticket_id IN ($seedTickets)");
    $pdo->exec("DELETE FROM payments WHERE booking_id IN ($seedBookings)");
    $pdo->exec("DELETE FROM tickets WHERE trip_id IN ($seedTrips) OR booking_id IN ($seedBookings)");
    $pdo->exec("DELETE FROM bookings WHERE agency_id IN ($seedAgencies)");
    $pdo->exec("DELETE FROM trips WHERE agency_id IN ($seedAgencies)");
    $pdo->exec("DELETE FROM routes WHERE agency_id IN ($seedAgencies)");
    $pdo->exec("DELETE FROM seats WHERE bus_id IN (SELECT id FROM buses WHERE agency_id IN ($seedAgencies))");
    $pdo->exec("DELETE FROM buses WHERE agency_id IN ($seedAgencies)");
    $pdo->exec("DELETE FROM drivers WHERE agency_id IN ($seedAgencies)");
    $pdo->exec("DELETE FROM agency_staff WHERE agency_id IN ($seedAgencies)");
    $pdo->exec("DELETE FROM refund_tiers WHERE agency_id IN ($seedAgencies)");
    $pdo->exec("DELETE FROM loyalty_redemptions WHERE agency_id IN ($seedAgencies)");
    $pdo->exec("DELETE FROM loyalty_ledger WHERE agency_id IN ($seedAgencies)");
    $pdo->exec("DELETE FROM loyalty_rewards WHERE agency_id IN ($seedAgencies)");
    $pdo->exec("DELETE FROM chat_key_envelopes WHERE group_id IN (SELECT id FROM chat_groups WHERE agency_id IN ($seedAgencies))");
    $pdo->exec("DELETE FROM chat_group_keys WHERE group_id IN (SELECT id FROM chat_groups WHERE agency_id IN ($seedAgencies))");
    $pdo->exec("DELETE FROM chat_messages WHERE group_id IN (SELECT id FROM chat_groups WHERE agency_id IN ($seedAgencies))");
    $pdo->exec("DELETE FROM chat_members WHERE group_id IN (SELECT id FROM chat_groups WHERE agency_id IN ($seedAgencies))");
    $pdo->exec("DELETE FROM chat_groups WHERE agency_id IN ($seedAgencies)");
    $pdo->exec("DELETE FROM bus_inquiries WHERE listing_id IN (SELECT id FROM bus_listings WHERE agency_id IN ($seedAgencies))");
    $pdo->exec("DELETE FROM bus_listings WHERE agency_id IN ($seedAgencies)");
    $pdo->exec("DELETE FROM rental_requests WHERE agency_id IN ($seedAgencies) OR contact_email LIKE '%.test'");
    $pdo->exec("DELETE FROM platform_alerts WHERE agency_id IN ($seedAgencies)");
    $pdo->exec("DELETE FROM agencies WHERE is_seed = 1");
    $pdo->exec("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE is_seed = 1)");
    $pdo->exec("DELETE FROM users WHERE is_seed = 1");

    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1");
} else {
    echo "[boot_prod] Données d'essais préservées (agences partenaires, flottes, lignes et comptes démo actifs).\n";
}

// =============================================================================
// COMPTE PROPRIÉTAIRE VELTRON (Nathan Zoua – Super Admin Production, is_seed = 0)
// Ne réécrit PAS le mot de passe si le propriétaire l'a déjà personnalisé !
// =============================================================================
$ownerPassword = env('OWNER_PASSWORD', 'Veltron#2026') ?: 'Veltron#2026';
$algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
$hash = password_hash($ownerPassword, $algo);

$stmtOwner = $pdo->prepare("INSERT INTO users (email, password_hash, first_name, last_name, locale, platform_role, is_seed)
                            VALUES (?, ?, 'Nathan', 'Zoua', 'fr', 'super_admin', 0)
                            ON DUPLICATE KEY UPDATE
                              password_hash = IF(password_hash IS NULL OR password_hash = '', VALUES(password_hash), password_hash),
                              platform_role = 'super_admin',
                              is_seed = 0");
$stmtOwner->execute(['najnathan23@gmail.com', $hash]);
$stmtOwner->execute(['admin@veltron.test', $hash]);

// Paramètres par défaut du compte de réception Propriétaire VELTRON
$pdo->exec("INSERT IGNORE INTO platform_settings (k, v) VALUES
  ('owner_payout_method', 'orange_money'),
  ('owner_payout_number', ''),
  ('owner_payout_name', 'Nathan Zoua (Propriétaire VELTRON)'),
  ('password_customized', '0')");

echo "[boot_prod] Base de production Haute Capacité prête (0 donnée de test, 212 pays actifs, index 2M+ utilisateurs activés).\n";
