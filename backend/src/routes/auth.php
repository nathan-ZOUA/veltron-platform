<?php
declare(strict_types=1);

// =============================================================================
// Authentification strictement séparée en 3 espaces étanches :
//   1. Passager   (/api/passenger/auth/*)  -> realm = 'passenger'
//   2. Agence     (/api/agency/auth/*)     -> realm = 'agency' (ID auto + Nom + E-mail + MDP + Code PIN 5 chiffres, 50s)
//   3. Plateforme (/api/platform/auth/*)   -> realm = 'platform' (propriétaire VELTRON)
// =============================================================================

function normalize_label(string $text): string
{
    $text = lower(trim($text));
    $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
    return preg_replace('/[^a-z0-9]+/', '', $ascii ?: $text) ?: '';
}

function check_user_credentials(string $email, string $password): array
{
    rate_limit('login:ip:' . client_ip(), 25, 300);
    $user = one('SELECT * FROM users WHERE email = ?', [$email]);
    if (!$user || $user['status'] !== 'active') {
        fail(401, 'bad_credentials', 'Identifiants incorrects.');
    }
    if ($user['locked_until'] && strtotime($user['locked_until'] . ' UTC') > time()) {
        $min = max(1, (int) ceil((strtotime($user['locked_until'] . ' UTC') - time()) / 60));
        fail(423, 'account_locked', "Compte temporairement verrouillé par sécurité. Réessayez dans $min min.");
    }
    if (!$user['password_hash'] || !password_verify($password, (string) $user['password_hash'])) {
        $fails = (int) $user['failed_logins'] + 1;
        if ($fails >= 6) {
            q('UPDATE users SET failed_logins = ?, locked_until = DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE) WHERE id = ?', [$fails, $user['id']]);
        } else {
            q('UPDATE users SET failed_logins = ? WHERE id = ?', [$fails, $user['id']]);
        }
        fail(401, 'bad_credentials', 'Identifiants incorrects.');
    }
    return $user;
}

function passenger_payload(array $u): array
{
    return [
        'id' => (int) $u['id'],
        'email' => $u['email'],
        'first_name' => $u['first_name'],
        'last_name' => $u['last_name'],
        'phone' => $u['phone'] ?? null,
        'locale' => $u['locale'] ?? 'fr',
        'realm' => 'passenger',
    ];
}

// ---------- 1. ESPACE PASSAGER ----------
route('POST', '/api/passenger/auth/register', function () {
    rate_limit('pax_reg:ip:' . client_ip(), 10, 600);
    $in = input();
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    $password = (string) ($in['password'] ?? '');
    $first = str_in($in['first_name'] ?? '', 80);
    $last = str_in($in['last_name'] ?? '', 80);
    $phone = str_in($in['phone'] ?? '', 25) ?: null;

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail(422, 'invalid_email', 'Adresse e-mail invalide.');
    if (strlen($password) < 8) fail(422, 'weak_password', 'Le mot de passe doit contenir au moins 8 caractères.');
    if ($first === '' || $last === '') fail(422, 'invalid_name', 'Nom et prénom obligatoires.');
    if (one('SELECT id FROM users WHERE email = ?', [$email])) fail(409, 'email_taken', 'Cette adresse e-mail est déjà utilisée.');

    $algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
    q('INSERT INTO users (email, phone, password_hash, first_name, last_name) VALUES (?,?,?,?,?)',
        [$email, $phone, password_hash($password, $algo), $first, $last]);
    $id = (int) db()->lastInsertId();
    $token = session_create($id, 'passenger');
    $user = one('SELECT * FROM users WHERE id = ?', [$id]);
    audit($id, null, 'passenger.register', 'user', $id);
    json_out(['token' => $token, 'user' => passenger_payload($user)], 201);
});

route('POST', '/api/passenger/auth/login', function () {
    $in = input();
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    $user = check_user_credentials($email, (string) ($in['password'] ?? ''));
    $token = session_create((int) $user['id'], 'passenger');
    audit((int) $user['id'], null, 'passenger.login', 'user', (int) $user['id']);
    json_out(['token' => $token, 'user' => passenger_payload($user)]);
});

route('GET', '/api/passenger/me', function () {
    $s = require_passenger();
    json_out(passenger_payload($s));
});

// Alias de compatibilité passager
route('POST', '/api/auth/register', fn() => fail(410, 'moved', 'Utilisez /api/passenger/auth/register'));
route('POST', '/api/auth/login', function () {
    $in = input();
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    $user = check_user_credentials($email, (string) ($in['password'] ?? ''));
    $token = session_create((int) $user['id'], 'passenger');
    json_out(['token' => $token, 'user' => passenger_payload($user)]);
});
route('GET', '/api/me', fn() => json_out(passenger_payload(require_passenger())));

// ---------- 2. ESPACE AGENCE (ID auto + Nom + E-mail + Mot de passe + Code PIN 5 chiffres, délai 50s) ----------
function agency_session_payload(int $userId, int $agencyId, string $role): array
{
    $u = one('SELECT id, email, first_name, last_name, phone, locale, avatar_url FROM users WHERE id = ?', [$userId]);
    $st = one('SELECT matricule, custom_role, avatar_url, job_title, dashboard_modules FROM agency_staff WHERE agency_id = ? AND user_id = ?', [$agencyId, $userId]);
    $a = one('SELECT id, public_code, slug, name, primary_color, currency_code, status, verification_status,
                     verification_score, fill_window_minutes, refund_cutoff_minutes, free_baggage_kg,
                     baggage_fee_per_kg, transfer_fee, points_per_trip, email, phone, address
              FROM agencies WHERE id = ?', [$agencyId]);
    $cur = one('SELECT minor_units, symbol FROM currencies WHERE code = ?', [$a['currency_code']]);
    return [
        'user' => [
            'id' => (int) $u['id'],
            'email' => $u['email'],
            'first_name' => $u['first_name'],
            'last_name' => $u['last_name'],
            'phone' => $u['phone'],
            'matricule' => $st['matricule'] ?? null,
            'custom_role' => $st['custom_role'] ?? null,
            'job_title' => $st['job_title'] ?? null,
            'avatar_url' => $st['avatar_url'] ?: ($u['avatar_url'] ?? null),
            'dashboard_modules' => !empty($st['dashboard_modules']) ? json_decode($st['dashboard_modules'], true) : null,
        ],
        'role' => $role,
        'agency' => [
            'id' => (int) $a['id'],
            'public_code' => $a['public_code'],
            'slug' => $a['slug'],
            'name' => $a['name'],
            'primary_color' => $a['primary_color'],
            'currency_code' => $a['currency_code'],
            'minor_units' => (int) ($cur['minor_units'] ?? 0),
            'currency_symbol' => $cur['symbol'] ?? $a['currency_code'],
            'status' => $a['status'],
            'verification_status' => $a['verification_status'],
            'verification_score' => $a['verification_score'] !== null ? (int) $a['verification_score'] : null,
            'fill_window_minutes' => (int) $a['fill_window_minutes'],
            'refund_cutoff_minutes' => (int) $a['refund_cutoff_minutes'],
            'free_baggage_kg' => (float) $a['free_baggage_kg'],
            'baggage_fee_per_kg' => (int) $a['baggage_fee_per_kg'],
            'transfer_fee' => (int) $a['transfer_fee'],
            'points_per_trip' => (int) $a['points_per_trip'],
            'email' => $a['email'],
            'phone' => $a['phone'],
            'address' => $a['address'],
        ],
    ];
}

function mask_email(string $email): string
{
    [$local, $dom] = explode('@', $email) + ['', ''];
    $head = substr($local, 0, min(2, strlen($local)));
    return $head . str_repeat('*', max(2, strlen($local) - 2)) . '@' . $dom;
}

route('POST', '/api/agency/auth/initiate', function () {
    rate_limit('agency_init:ip:' . client_ip(), 15, 300);
    $in = input();
    $publicCode = strtoupper(trim((string) ($in['public_code'] ?? '')));
    $agencyName = trim((string) ($in['agency_name'] ?? ''));
    $loginId = trim((string) ($in['email_or_matricule'] ?? $in['email'] ?? $in['matricule'] ?? ''));
    $password = (string) ($in['password'] ?? '');

    if ($publicCode === '' || $agencyName === '' || $loginId === '' || $password === '') {
        fail(422, 'missing_fields', 'Renseignez l\'ID de l\'agence, son nom, votre E-mail ou Matricule, et le mot de passe.');
    }

    $agency = one('SELECT * FROM agencies WHERE public_code = ?', [$publicCode]);
    if (!$agency || normalize_label($agency['name']) !== normalize_label($agencyName)) {
        fail(401, 'bad_agency_credentials', 'ID d\'agence ou nom d\'agence introuvable.');
    }
    if ($agency['status'] === 'suspended') {
        fail(403, 'agency_suspended', 'Cette agence est actuellement suspendue par la sécurité VELTRON.');
    }

    // Connexion par E-mail personnel OU par Matricule unique au sein de l'agence
    $isEmail = str_contains($loginId, '@');
    if ($isEmail) {
        $email = strtolower($loginId);
        $staffRow = one("SELECT st.role, st.status, st.matricule, st.custom_role, st.avatar_url, u.email AS user_email, u.id AS user_id
                         FROM agency_staff st JOIN users u ON u.id = st.user_id
                         WHERE st.agency_id = ? AND LOWER(u.email) = ?", [$agency['id'], $email]);
        if (!$staffRow && strtolower($agency['email']) === $email) {
            $staffRow = one("SELECT st.role, st.status, st.matricule, st.custom_role, st.avatar_url, u.email AS user_email, u.id AS user_id
                             FROM agency_staff st JOIN users u ON u.id = st.user_id
                             WHERE st.agency_id = ? AND st.role = 'owner' ORDER BY st.id LIMIT 1", [$agency['id']]);
        }
    } else {
        // Recherche par Matricule (insensible à la casse, ex. AG1-SEC-02 ou SEC-01)
        $matricule = strtoupper($loginId);
        $staffRow = one("SELECT st.role, st.status, st.matricule, st.custom_role, st.avatar_url, u.email AS user_email, u.id AS user_id
                         FROM agency_staff st JOIN users u ON u.id = st.user_id
                         WHERE st.agency_id = ? AND UPPER(st.matricule) = ?", [$agency['id'], $matricule]);
    }

    if (!$staffRow || $staffRow['status'] !== 'active') {
        fail(401, 'bad_agency_credentials', 'Aucun compte actif ne correspond à cet E-mail ou Matricule dans cette agence.');
    }

    // Vérification du mot de passe personnel du compte (isolation stricte entre les 6 comptes)
    check_user_credentials((string) $staffRow['user_email'], $password);

    // Envoi du code de validation à 5 chiffres (avec délai de réinitialisation de 50 secondes)
    $otpTargetEmail = (string) $staffRow['user_email'];
    otp_cooldown('agency_login', $otpTargetEmail);
    [$challenge, $code] = otp_issue('agency_login', $otpTargetEmail, (int) $agency['id'], (int) $staffRow['user_id']);

    send_veltron_mail($otpTargetEmail,
        "Code d'accès sécurisé VELTRON – {$agency['name']}",
        "Bonjour,\n\nUne connexion à l'espace agence « {$agency['name']} » ({$agency['public_code']}) a été demandée.\n"
        . "Votre code de validation à 5 chiffres est : {$code}\n\n"
        . "Ce code expire dans 10 minutes. Ne le communiquez jamais.\n");

    audit((int) $staffRow['user_id'], (int) $agency['id'], 'agency.otp_sent', 'agency', (int) $agency['id'], ['role' => $staffRow['role']]);

    json_out(array_merge([
        'challenge' => $challenge,
        'masked_email' => mask_email($otpTargetEmail),
        'agency_name' => $agency['name'],
        'role' => $staffRow['role'],
        'resend_in' => OTP_RESEND_AFTER,
        'expires_in' => OTP_TTL,
    ], dev_code($code)));
});

route('POST', '/api/agency/auth/resend', function () {
    rate_limit('agency_resend:ip:' . client_ip(), 10, 300);
    $prevChallenge = trim((string) (input()['challenge'] ?? ''));
    $prev = one("SELECT * FROM otp_codes WHERE challenge = ? AND purpose = 'agency_login'", [$prevChallenge])
        ?? fail(404, 'not_found', 'Session de vérification introuvable. Recommencez la connexion.');

    otp_cooldown('agency_login', (string) $prev['email']);
    [$challenge, $code] = otp_issue('agency_login', (string) $prev['email'], (int) $prev['agency_id'], (int) $prev['user_id']);

    $agency = one('SELECT name, public_code FROM agencies WHERE id = ?', [(int) $prev['agency_id']]);
    send_veltron_mail((string) $prev['email'],
        'Nouveau code d\'accès VELTRON',
        "Votre nouveau code de validation à 5 chiffres pour {$agency['name']} ({$agency['public_code']}) est : {$code}\nIl expire dans 10 minutes.");

    json_out(array_merge([
        'challenge' => $challenge,
        'resend_in' => OTP_RESEND_AFTER,
        'expires_in' => OTP_TTL,
    ], dev_code($code)));
});

route('POST', '/api/agency/auth/verify', function () {
    $in = input();
    $challenge = trim((string) ($in['challenge'] ?? ''));
    $code = (string) ($in['code'] ?? '');
    $row = otp_check($challenge, $code, 'agency_login');

    $staff = one("SELECT role, status FROM agency_staff WHERE agency_id = ? AND user_id = ?",
        [(int) $row['agency_id'], (int) $row['user_id']]);
    if (!$staff || $staff['status'] !== 'active') fail(403, 'access_revoked', 'Compte désactivé.');

    $token = session_create((int) $row['user_id'], 'agency', (int) $row['agency_id'], $staff['role']);
    q('UPDATE agency_staff SET last_login_at = UTC_TIMESTAMP() WHERE agency_id = ? AND user_id = ?',
        [(int) $row['agency_id'], (int) $row['user_id']]);
    audit((int) $row['user_id'], (int) $row['agency_id'], 'agency.login', 'agency', (int) $row['agency_id'], ['role' => $staff['role']]);

    json_out([
        'token' => $token,
        'session' => agency_session_payload((int) $row['user_id'], (int) $row['agency_id'], $staff['role']),
    ]);
});

route('GET', '/api/agency/me', function () {
    $s = require_agency();
    json_out(agency_session_payload((int) $s['id'], (int) $s['agency_id'], (string) $s['role']));
});

// Demande d'adhésion d'un futur collaborateur à une agence (Self-onboarding avec mise en attente)
route('POST', '/api/agency/join-request', function () {
    rate_limit('agency_join:ip:' . client_ip(), 10, 300);
    $in = input();
    $code = strtoupper(trim((string) ($in['agency_code'] ?? '')));
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    $first = str_in($in['first_name'] ?? '', 80);
    $last = str_in($in['last_name'] ?? '', 80);
    $phone = str_in($in['phone'] ?? '', 25) ?: null;
    $password = (string) ($in['password'] ?? '');
    $role = (string) ($in['requested_role'] ?? 'staff');
    $customTitle = str_in($in['custom_role_title'] ?? '', 100) ?: null;
    $modules = is_array($in['modules'] ?? null) ? $in['modules'] : [];

    if (!$code || !$email || !$first || !$last || strlen($password) < 6) {
        fail(422, 'validation_error', 'Veuillez remplir tous les champs obligatoires (mot de passe de 6 caractères min).');
    }

    $agency = one("SELECT id, name, public_code, status FROM agencies WHERE public_code = ? OR UPPER(slug) = ?", [$code, $code])
        ?? fail(404, 'agency_not_found', 'Code d\'agence invalide ou introuvable.');

    if ($agency['status'] === 'suspended') fail(403, 'agency_suspended', 'Cette agence est actuellement suspendue.');

    // Vérifier si un compte actif existe déjà pour cet email dans cette agence
    $existingStaff = one("SELECT st.id FROM agency_staff st JOIN users u ON u.id = st.user_id WHERE st.agency_id = ? AND u.email = ? AND st.status = 'active'",
        [$agency['id'], $email]);
    if ($existingStaff) {
        fail(409, 'already_staff', 'Vous êtes déjà membre actif de cette agence. Connectez-vous avec votre matricule.');
    }

    // Vérifier si une demande est déjà en attente
    $existingReq = one("SELECT id, status FROM staff_join_requests WHERE agency_id = ? AND email = ? ORDER BY id DESC LIMIT 1",
        [$agency['id'], $email]);
    if ($existingReq && $existingReq['status'] === 'pending') {
        fail(409, 'already_pending', 'Une demande d\'adhésion est déjà en attente de validation par l\'administrateur.');
    }

    $pwHash = password_hash($password, PASSWORD_DEFAULT);
    $ip = client_ip();
    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';

    q("INSERT INTO staff_join_requests (agency_id, first_name, last_name, email, phone, password_hash, requested_role, custom_role_title, modules_json, status, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
        [$agency['id'], $first, $last, $email, $phone, $pwHash, $role, $customTitle, json_encode($modules, JSON_UNESCAPED_UNICODE), $ip, $userAgent]);

    // Notifier les administrateurs de l'agence
    $owners = all("SELECT user_id FROM agency_staff WHERE agency_id = ? AND role = 'owner'", [$agency['id']]);
    foreach ($owners as $ow) {
        notify_user((int) $ow['user_id'], 'staff.join_request', [
            'applicant_name' => "$first $last",
            'applicant_email' => $email,
            'requested_role' => $customTitle ?: $role,
            'agency_name' => $agency['name']
        ]);
    }

    json_out([
        'ok' => true,
        'status' => 'pending',
        'agency_name' => $agency['name'],
        'agency_code' => $agency['public_code'],
        'message' => "Votre demande a été transmise à l'administrateur de {$agency['name']}. Vous êtes actuellement en attente de validation."
    ]);
});

// Consultation du statut de la demande d'adhésion par le candidat
route('GET', '/api/agency/join-request/status', function () {
    $email = strtolower(trim((string) ($_GET['email'] ?? '')));
    $code = strtoupper(trim((string) ($_GET['agency_code'] ?? '')));

    if (!$email || !$code) fail(422, 'missing_params', 'Email et code d\'agence requis.');

    $agency = one("SELECT id, name FROM agencies WHERE public_code = ? OR UPPER(slug) = ?", [$code, $code])
        ?? fail(404, 'not_found', 'Agence introuvable.');

    $req = one("SELECT * FROM staff_join_requests WHERE agency_id = ? AND email = ? ORDER BY id DESC LIMIT 1",
        [$agency['id'], $email]);

    if (!$req) fail(404, 'no_request', 'Aucune demande d\'adhésion trouvée.');

    json_out([
        'status' => $req['status'],
        'agency_name' => $agency['name'],
        'first_name' => $req['first_name'],
        'last_name' => $req['last_name'],
        'requested_role' => $req['requested_role'],
        'custom_role_title' => $req['custom_role_title'],
        'matricule' => $req['matricule_generated'],
        'created_at' => iso($req['created_at']),
        'decided_at' => $req['decided_at'] ? iso($req['decided_at']) : null,
    ]);
});

// ---------- 3. ESPACE PROPRIÉTAIRE / SUPERVISION VELTRON ----------
route('POST', '/api/platform/auth/login', function () {
    $in = input();
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    $user = check_user_credentials($email, (string) ($in['password'] ?? ''));
    if ($user['platform_role'] === 'none') fail(403, 'forbidden', 'Accès réservé au propriétaire VELTRON.');
    $token = session_create((int) $user['id'], 'platform');
    audit((int) $user['id'], null, 'platform.login', 'user', (int) $user['id']);
    json_out(['token' => $token, 'user' => [
        'id' => (int) $user['id'], 'email' => $user['email'],
        'first_name' => $user['first_name'], 'last_name' => $user['last_name'],
        'platform_role' => $user['platform_role'],
    ]]);
});

route('GET', '/api/platform/me', function () {
    $s = require_platform_admin();
    json_out([
        'id' => (int) $s['id'], 'email' => $s['email'],
        'first_name' => $s['first_name'], 'last_name' => $s['last_name'],
        'platform_role' => $s['platform_role'],
    ]);
});

// Déconnexion universelle (révoque immédiatement le jeton en base)
route('POST', '/api/auth/logout', function () {
    $token = bearer_token();
    if ($token) {
        q('UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE token_hash = ?', [hash('sha256', $token)]);
    }
    json_out(['ok' => true]);
});
