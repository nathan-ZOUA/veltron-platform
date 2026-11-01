<?php
declare(strict_types=1);

// =============================================================================
// Noyau : configuration, base de données, réponses JSON, sécurité.
//
// Sécurité en bref :
//  - Sessions révocables stockées en base (seule l'empreinte SHA-256 du jeton est gardée).
//  - Trois "espaces" étanches : passenger, agency, platform. Un jeton passager ne peut
//    jamais appeler une route d'agence ; un jeton d'agence est lié à UNE agence et UN rôle.
//  - Codes à usage unique (OTP) hachés en HMAC, 5 essais max, expiration 10 min,
//    renvoi possible seulement après 50 s (contrôlé par le serveur).
//  - Limitation de débit par IP et par identifiant, verrouillage après échecs répétés.
//  - Requêtes préparées uniquement, en-têtes de sécurité HTTP, journal d'audit.
// =============================================================================

date_default_timezone_set('UTC');

class HttpError extends Exception
{
    public function __construct(public int $status, public string $errorCode, string $message, public array $extra = [])
    {
        parent::__construct($message);
    }
}

function fail(int $status, string $code, string $message, array $extra = []): never
{
    throw new HttpError($status, $code, $message, $extra);
}

// ---------- Configuration (.env) ----------
function env(string $key, ?string $default = null): ?string
{
    static $values = null;
    if ($values === null) {
        $values = [];
        $file = __DIR__ . '/../.env';
        if (is_file($file)) {
            foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) continue;
                [$k, $v] = explode('=', $line, 2);
                $values[trim($k)] = trim(trim($v), '"');
            }
        }
    }
    $fromEnv = $_ENV[$key] ?? getenv($key);
    if ($fromEnv !== false && $fromEnv !== null && $fromEnv !== '') return (string) $fromEnv;
    return ($values[$key] ?? '') !== '' ? $values[$key] : $default;
}

function is_local(): bool
{
    return in_array(env('APP_ENV', 'local'), ['local', 'demo'], true) || env('SHOW_OTP_HINT', '1') === '1';
}

// Petits utilitaires tolérants à l'absence de l'extension mbstring
function lower(string $s): string { return function_exists('mb_strtolower') ? mb_strtolower($s, 'UTF-8') : strtolower($s); }
function cut(string $s, int $len): string { return function_exists('mb_substr') ? mb_substr($s, 0, $len, 'UTF-8') : substr($s, 0, $len); }
function str_in(mixed $v, int $max = 255): string { return cut(trim((string) $v), $max); }

// ---------- Base de données (PDO, requêtes préparées uniquement) ----------
function db_config(): array
{
    $url = env('MYSQL_URL') ?: env('DATABASE_URL');
    if ($url && str_starts_with($url, 'mysql://')) {
        $p = parse_url($url);
        return [
            'host' => $p['host'] ?? '127.0.0.1',
            'port' => (string) ($p['port'] ?? '3306'),
            'name' => ltrim($p['path'] ?? '/veltron', '/') ?: 'veltron',
            'user' => isset($p['user']) ? rawurldecode($p['user']) : 'root',
            'pass' => isset($p['pass']) ? rawurldecode($p['pass']) : '',
        ];
    }
    return [
        'host' => env('MYSQLHOST') ?: env('DB_HOST', '127.0.0.1'),
        'port' => env('MYSQLPORT') ?: env('DB_PORT', '3306'),
        'name' => env('MYSQLDATABASE') ?: env('DB_NAME', 'veltron'),
        'user' => env('MYSQLUSER') ?: env('DB_USER', 'root'),
        'pass' => env('MYSQLPASSWORD') ?? env('DB_PASS', ''),
    ];
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $cfg = db_config();
        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
            $cfg['host'], $cfg['port'], $cfg['name']);
        $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec("SET time_zone = '+00:00'"); // tout est stocké en UTC
    }
    return $pdo;
}

function q(string $sql, array $params = []): PDOStatement
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

function all(string $sql, array $params = []): array { return q($sql, $params)->fetchAll(); }
function one(string $sql, array $params = []): ?array { return q($sql, $params)->fetch() ?: null; }

function transaction(callable $fn): mixed
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $result = $fn();
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

// "2026-10-31 14:00:00" -> "2026-10-31T14:00:00Z"
function iso(?string $utc): ?string { return $utc ? str_replace(' ', 'T', substr($utc, 0, 19)) . 'Z' : null; }

// ---------- Requêtes / réponses ----------
function input(): array
{
    static $data = null;
    if ($data === null) {
        $raw = file_get_contents('php://input') ?: '[]';
        if (strlen($raw) > 8 * 1024 * 1024) fail(413, 'too_large', 'Requête trop volumineuse.');
        $decoded = json_decode($raw, true);
        $data = is_array($decoded) ? $decoded : [];
    }
    return $data;
}

function json_out(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
    header('Permissions-Policy: geolocation=(), camera=(), microphone=()');
    header('Cross-Origin-Resource-Policy: same-origin');
    if (($_SERVER['HTTPS'] ?? '') === 'on') header('Strict-Transport-Security: max-age=63072000; includeSubDomains');
    // CORS : seule l'origine du site est autorisée (le proxy Vite rend les appels "same-origin" en local)
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = array_filter(array_map('trim', explode(',', env('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173'))));
    if ($origin && in_array($origin, $allowed, true)) {
        header("Access-Control-Allow-Origin: $origin");
        header('Vary: Origin');
        header('Access-Control-Allow-Headers: Content-Type, Authorization');
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
}

function client_ip(): string
{
    // Derrière un proxy de confiance uniquement (TRUST_PROXY=1), on lit X-Forwarded-For
    if (env('TRUST_PROXY') === '1' && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        return trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
    }
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

// ---------- Clé de l'application ----------
function b64u(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64u_dec(string $s): string { return (string) base64_decode(strtr($s, '-_', '+/')); }

function app_key(): string
{
    $key = env('APP_KEY');
    if (!$key || strlen($key) < 32 || $key === 'change-me-with-a-long-random-string') {
        fail(500, 'config', 'APP_KEY manquant ou trop court : définissez-le dans backend/.env');
    }
    return $key;
}

// Jeton signé à durée courte (ex. preuve de vérification d'e-mail)
function signed_make(array $payload, int $ttl): string
{
    $payload['exp'] = time() + $ttl;
    $body = b64u(json_encode($payload));
    return $body . '.' . b64u(hash_hmac('sha256', $body, app_key(), true));
}

function signed_read(string $token): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 2) return null;
    if (!hash_equals(b64u(hash_hmac('sha256', $parts[0], app_key(), true)), $parts[1])) return null;
    $payload = json_decode(b64u_dec($parts[0]), true);
    return (is_array($payload) && ($payload['exp'] ?? 0) > time()) ? $payload : null;
}

// ---------- Limitation de débit ----------
function rate_limit(string $bucket, int $max, int $windowSeconds): void
{
    $row = one('SELECT hits, window_start FROM rate_limits WHERE bucket = ?', [$bucket]);
    $now = time();
    if (!$row || strtotime($row['window_start'] . ' UTC') + $windowSeconds < $now) {
        q('REPLACE INTO rate_limits (bucket, hits, window_start) VALUES (?, 1, UTC_TIMESTAMP())', [$bucket]);
        return;
    }
    if ((int) $row['hits'] >= $max) {
        $retry = strtotime($row['window_start'] . ' UTC') + $windowSeconds - $now;
        header('Retry-After: ' . max(1, $retry));
        fail(429, 'rate_limited', 'Trop de tentatives. Réessayez dans ' . max(1, (int) ceil($retry / 60)) . ' min.', ['retry_after' => $retry]);
    }
    q('UPDATE rate_limits SET hits = hits + 1 WHERE bucket = ?', [$bucket]);
}

// ---------- Sessions ----------
const SESSION_TTL = ['passenger' => 30 * 86400, 'agency' => 12 * 3600, 'platform' => 8 * 3600];

function session_create(int $userId, string $realm, ?int $agencyId = null, ?string $role = null): string
{
    $token = b64u(random_bytes(32));
    q('INSERT INTO sessions (token_hash, user_id, realm, agency_id, role, ip, user_agent, expires_at)
       VALUES (?,?,?,?,?,?,?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))',
        [hash('sha256', $token), $userId, $realm, $agencyId, $role, client_ip(),
         substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255), SESSION_TTL[$realm]]);
    q('UPDATE users SET last_login_at = UTC_TIMESTAMP(), failed_logins = 0, locked_until = NULL WHERE id = ?', [$userId]);
    return $token;
}

function bearer_token(): ?string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    return preg_match('/^Bearer\s+([A-Za-z0-9_\-]{20,100})$/', $header, $m) ? $m[1] : null;
}

// Session courante (+ utilisateur), ou null
function current_session(): ?array
{
    static $cache = false;
    if ($cache !== false) return $cache;
    $cache = null;
    $token = bearer_token();
    if (!$token) return null;
    $s = one("SELECT s.id AS session_id, s.realm, s.agency_id, s.role, s.last_seen_at,
                     u.id, u.email, u.first_name, u.last_name, u.phone, u.locale, u.platform_role
              FROM sessions s JOIN users u ON u.id = s.user_id
              WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP()
                AND u.status = 'active'", [hash('sha256', $token)]);
    if (!$s) return null;
    if (strtotime($s['last_seen_at'] . ' UTC') < time() - 60) {
        q('UPDATE sessions SET last_seen_at = UTC_TIMESTAMP() WHERE id = ?', [$s['session_id']]);
    }
    return $cache = $s;
}

function require_realm(string $realm): array
{
    $s = current_session();
    if (!$s) fail(401, 'unauthenticated', 'Connexion requise.');
    if ($s['realm'] !== $realm) fail(403, 'wrong_space', 'Cet espace n\'est pas accessible avec cette connexion.');
    return $s;
}

function require_passenger(): array { return require_realm('passenger'); }

function require_platform_admin(): array
{
    $s = require_realm('platform');
    if ($s['platform_role'] === 'none') fail(403, 'forbidden', 'Réservé à l\'équipe VELTRON.');
    return $s;
}

// Espace agence : vérifie la session, le rôle et que le compte est toujours actif dans CETTE agence.
const ALL_ROLES = ['owner', 'manager', 'secretary', 'driver', 'staff', 'accountant'];

function require_agency(array $roles = ALL_ROLES): array
{
    $s = require_realm('agency');
    $staff = one("SELECT st.role, st.status, a.status AS agency_status FROM agency_staff st
                  JOIN agencies a ON a.id = st.agency_id
                  WHERE st.agency_id = ? AND st.user_id = ?", [$s['agency_id'], $s['id']]);
    if (!$staff || $staff['status'] !== 'active') {
        q('UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE id = ?', [$s['session_id']]);
        fail(401, 'access_revoked', 'Votre accès à cette agence a été retiré.');
    }
    if ($staff['agency_status'] === 'suspended') fail(403, 'agency_suspended', 'Cette agence est suspendue.');
    if (!in_array($staff['role'], $roles, true)) fail(403, 'forbidden', 'Votre rôle ne permet pas cette action.');
    $s['role'] = $staff['role'];
    $s['agency_id'] = (int) $s['agency_id'];
    return $s;
}

// Compatibilité : vérifie qu'une ressource appartient bien à l'agence de la session
function require_staff(int $agencyId, array $roles = ALL_ROLES): array
{
    $s = require_agency($roles);
    if ($s['agency_id'] !== $agencyId) fail(403, 'forbidden', 'Accès refusé pour cette agence.');
    return $s;
}

function audit(?int $actor, ?int $agencyId, string $action, ?string $entity = null, ?int $entityId = null, array $meta = []): void
{
    q('INSERT INTO audit_logs (actor_user_id, agency_id, action, entity, entity_id, ip, meta) VALUES (?,?,?,?,?,?,?)',
        [$actor, $agencyId, $action, $entity, $entityId, client_ip(), json_encode($meta, JSON_UNESCAPED_UNICODE)]);
}

function notify_user(int $userId, string $type, array $payload): void
{
    q('INSERT INTO notifications (user_id, type, payload) VALUES (?,?,?)', [$userId, $type, json_encode($payload, JSON_UNESCAPED_UNICODE)]);
}

// ---------- Codes à usage unique (OTP) ----------
const OTP_TTL = 600;          // 10 minutes
const OTP_RESEND_AFTER = 50;  // secondes avant de pouvoir redemander un code
const OTP_MAX_ATTEMPTS = 5;

function otp_hash(string $code): string { return hash_hmac('sha256', $code, app_key()); }

// Crée (ou renouvelle) un code. Retourne [challenge, code].
function otp_issue(string $purpose, string $email, ?int $agencyId = null, ?int $userId = null): array
{
    $code = str_pad((string) random_int(0, 99999), 5, '0', STR_PAD_LEFT);
    $challenge = bin2hex(random_bytes(16));
    q('UPDATE otp_codes SET consumed_at = UTC_TIMESTAMP() WHERE purpose = ? AND email = ? AND consumed_at IS NULL', [$purpose, $email]);
    q('INSERT INTO otp_codes (challenge, purpose, email, agency_id, user_id, code_hash, ip, expires_at)
       VALUES (?,?,?,?,?,?,?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))',
        [$challenge, $purpose, $email, $agencyId, $userId, otp_hash($code), client_ip(), OTP_TTL]);
    return [$challenge, $code];
}

// Vérifie le délai de renvoi (50 s) pour un e-mail donné
function otp_cooldown(string $purpose, string $email): void
{
    $last = one('SELECT TIMESTAMPDIFF(SECOND, last_sent_at, UTC_TIMESTAMP()) AS ago FROM otp_codes
                 WHERE purpose = ? AND email = ? ORDER BY id DESC LIMIT 1', [$purpose, $email]);
    if ($last && (int) $last['ago'] < OTP_RESEND_AFTER) {
        $wait = OTP_RESEND_AFTER - (int) $last['ago'];
        fail(429, 'otp_cooldown', "Patientez $wait s avant de demander un nouveau code.", ['retry_after' => $wait]);
    }
}

// Valide un code ; retourne la ligne OTP ou lève une erreur
function otp_check(string $challenge, string $code, string $purpose): array
{
    $code = preg_replace('/\D/', '', $code);
    $row = one('SELECT * FROM otp_codes WHERE challenge = ? AND purpose = ?', [$challenge, $purpose]);
    if (!$row || $row['consumed_at'] !== null || strtotime($row['expires_at'] . ' UTC') < time()) {
        fail(422, 'otp_expired', 'Code expiré. Demandez un nouveau code.');
    }
    if ((int) $row['attempts'] >= OTP_MAX_ATTEMPTS) {
        q('UPDATE otp_codes SET consumed_at = UTC_TIMESTAMP() WHERE id = ?', [$row['id']]);
        fail(422, 'otp_locked', 'Trop d\'essais. Demandez un nouveau code.');
    }
    if (!hash_equals($row['code_hash'], otp_hash($code))) {
        q('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?', [$row['id']]);
        $left = OTP_MAX_ATTEMPTS - (int) $row['attempts'] - 1;
        fail(422, 'otp_invalid', "Code incorrect. Il vous reste $left essai(s).", ['attempts_left' => $left]);
    }
    q('UPDATE otp_codes SET consumed_at = UTC_TIMESTAMP() WHERE id = ?', [$row['id']]);
    return $row;
}

// En local (MAIL_MODE=log), le code est renvoyé à l'écran pour pouvoir tester sans serveur e-mail.
function dev_code(string $code): array
{
    return (is_local() && env('MAIL_MODE', 'log') === 'log') ? ['dev_code' => $code] : [];
}

// ---------- Règles métier partagées ----------

// Libère les sièges des réservations non payées dont le délai est dépassé
function expire_holds(): void
{
    db()->exec("UPDATE tickets t JOIN bookings b ON b.id = t.booking_id
                SET t.status = 'expired'
                WHERE b.status = 'pending' AND b.expires_at < UTC_TIMESTAMP() AND t.status = 'held'");
    db()->exec("UPDATE bookings SET status = 'expired'
                WHERE status = 'pending' AND expires_at < UTC_TIMESTAMP()");
}

// Remboursement : impossible après le délai de coupure (2 h minimum) avant le départ.
// $k doit contenir : status, price, departs_at, agency_id, refund_cutoff_minutes
function refund_quote(array $k): array
{
    $minutes = (int) floor((strtotime($k['departs_at'] . ' UTC') - time()) / 60);
    $quote = ['allowed' => false, 'percent' => 0, 'amount' => 0, 'minutes_before' => $minutes,
              'cutoff_minutes' => (int) $k['refund_cutoff_minutes']];
    if ($k['status'] !== 'valid' || $minutes < (int) $k['refund_cutoff_minutes']) return $quote;

    $tier = one('SELECT refund_percent FROM refund_tiers
                 WHERE agency_id = ? AND min_minutes_before <= ?
                 ORDER BY min_minutes_before DESC LIMIT 1', [$k['agency_id'], $minutes]);
    $percent = $tier ? (int) $tier['refund_percent'] : 0;
    return array_merge($quote, [
        'allowed' => $percent > 0,
        'percent' => $percent,
        'amount' => intdiv((int) $k['price'] * $percent, 100),
    ]);
}

function random_code(int $len, string $alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'): string
{
    $out = '';
    for ($i = 0; $i < $len; $i++) $out .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    return $out;
}

function new_reference(): string { return 'VLT-' . random_code(6); }
function new_qr_token(): string { return bin2hex(random_bytes(20)); } // 40 caractères

// Conversion heure locale (ville) <-> UTC
function local_to_utc(string $local, string $tz): string
{
    try {
        $d = new DateTimeImmutable($local, new DateTimeZone($tz));
    } catch (Throwable) {
        fail(422, 'invalid_date', 'Date ou heure invalide.');
    }
    return $d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
}

// Commission automatique VELTRON (0,5 % = 50 bps) prélevée et créditée sur le compte propriétaire
// dès qu'un bus est plein ou qu'un départ est lancé / terminé.
function settle_trip_commission(int $tripId, ?string $forceTrigger = null): ?array
{
    $t = one("SELECT t.id, t.agency_id, t.status, b.seat_count, a.currency_code, a.commission_rate_bps
              FROM trips t
              JOIN buses b ON b.id = t.bus_id
              JOIN agencies a ON a.id = t.agency_id
              WHERE t.id = ?", [$tripId]);
    if (!$t) return null;

    $agg = one("SELECT COUNT(*) AS seats_filled, COALESCE(SUM(price), 0) AS gross_amount
                FROM tickets
                WHERE trip_id = ? AND status IN ('valid','boarded')", [$tripId]);
    $seatsFilled  = (int) ($agg['seats_filled'] ?? 0);
    $seatCapacity = (int) $t['seat_count'];
    $grossAmount  = (int) ($agg['gross_amount'] ?? 0);
    $isFullBus    = ($seatCapacity > 0 && $seatsFilled >= $seatCapacity) ? 1 : 0;
    $isDeparted   = in_array($t['status'], ['departed', 'completed'], true);

    if (!$isFullBus && !$isDeparted && $forceTrigger === null) {
        return null;
    }

    $trigger = $forceTrigger ?? ($isFullBus ? 'full_bus' : ($t['status'] === 'completed' ? 'completed' : 'departed'));
    if ($isFullBus) $trigger = 'full_bus';

    $rateBps = (int) ($t['commission_rate_bps'] ?: env('PLATFORM_COMMISSION_BPS', '50'));
    if ($rateBps <= 0) $rateBps = 50;
    $commissionAmount = $grossAmount > 0 ? (int) ceil(($grossAmount * $rateBps) / 10000) : 0;

    q("INSERT INTO platform_commissions
         (trip_id, agency_id, seats_filled, seat_capacity, is_full_bus, gross_amount, rate_bps, commission_amount, currency_code, trigger_event, status, settled_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,'settled',UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         seats_filled = VALUES(seats_filled),
         seat_capacity = VALUES(seat_capacity),
         is_full_bus = VALUES(is_full_bus),
         gross_amount = VALUES(gross_amount),
         rate_bps = VALUES(rate_bps),
         commission_amount = VALUES(commission_amount),
         trigger_event = IF(VALUES(is_full_bus) = 1, 'full_bus', VALUES(trigger_event)),
         settled_at = UTC_TIMESTAMP()",
        [$tripId, (int) $t['agency_id'], $seatsFilled, $seatCapacity, $isFullBus, $grossAmount, $rateBps, $commissionAmount, $t['currency_code'], $trigger]);

    return one('SELECT * FROM platform_commissions WHERE trip_id = ?', [$tripId]);
}

require_once __DIR__ . '/mailer.php';
