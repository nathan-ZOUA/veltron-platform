<?php
declare(strict_types=1);

// =============================================================================
// Création sécurisée d'une agence :
//  - Unicité stricte de l'adresse physique normalisée (aucun doublon possible)
//  - Vérification de propriété de l'adresse e-mail par code PIN aléatoire à 5 chiffres
//    (renvoi après 50 s)
//  - Attribution automatique d'un ID Agence unique (AG-XXXXXX)
//  - Audit automatique par le Système de Vérification IA VELTRON :
//      * Authentique (score >= 75) => agence activée immédiatement !
//      * Douteux / incomplet => mis en revue + transmission immédiate par E-mail &
//        WhatsApp au propriétaire VELTRON avec liens directs pour contacter l'agence.
// =============================================================================

function slugify(string $text): string
{
    $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text) ?: $text;
    $text = strtolower(trim(preg_replace('/[^A-Za-z0-9]+/', '-', $ascii) ?: '', '-'));
    return $text !== '' ? substr($text, 0, 50) : 'agence';
}

function normalize_agency_address(string $address): string
{
    $value = lower(trim($address));
    $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value) ?: $value;
    // Supprime les mots-outils fréquents pour détecter la même adresse écrite légèrement différemment
    $ascii = preg_replace('/\b(rue|avenue|av|boulevard|bd|quartier|qtr|bp|no|num|numero)\b/', '', $ascii) ?: $ascii;
    return preg_replace('/[^a-z0-9]+/', '', $ascii) ?: '';
}

function generate_agency_code(): string
{
    do {
        $code = 'AG-' . random_code(6);
    } while (one('SELECT id FROM agencies WHERE public_code = ?', [$code]));
    return $code;
}

// Vérification préalable d'unicité de l'adresse et de l'e-mail dès l'étape 1
route('POST', '/api/agencies/check-address', function () {
    $in = input();
    $address = trim((string) ($in['address'] ?? ''));
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    $norm = normalize_agency_address($address);

    if (strlen($address) < 10 || strlen($norm) < 6) {
        fail(422, 'address_too_short', 'Indiquez une adresse physique précise (ville, quartier, rue et repère).');
    }
    if (one('SELECT id FROM agencies WHERE address_normalized = ?', [$norm])) {
        fail(409, 'address_taken', 'Deux agences ne peuvent pas avoir la même adresse : cette adresse est déjà enregistrée sur VELTRON.');
    }
    if ($email !== '' && one('SELECT id FROM agencies WHERE email = ?', [$email])) {
        fail(409, 'email_taken', 'Cette adresse e-mail d\'agence est déjà enregistrée.');
    }
    json_out(['available' => true]);
});

// Envoi du code PIN aléatoire à 5 chiffres pour prouver que l'adresse e-mail appartient au créateur
route('POST', '/api/agencies/verification/send', function () {
    rate_limit('ag_pin_send:ip:' . client_ip(), 12, 600);
    $email = strtolower(trim((string) (input()['email'] ?? '')));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail(422, 'invalid_email', 'Adresse e-mail invalide.');

    otp_cooldown('agency_registration', $email);
    [$challenge, $code] = otp_issue('agency_registration', $email);

    send_veltron_mail($email,
        'Code PIN de confirmation VELTRON (5 chiffres)',
        "Bonjour,\n\nPour confirmer que cette adresse vous appartient lors de la création de votre agence sur VELTRON, saisissez ce code PIN à 5 chiffres :\n\n"
        . "    {$code}\n\n"
        . "Ce code est valable 10 minutes.\n");

    json_out(array_merge([
        'ok' => true,
        'challenge' => $challenge,
        'expires_in' => OTP_TTL,
        'resend_in' => OTP_RESEND_AFTER,
    ], dev_code($code)));
});

// Validation du code PIN à 5 chiffres -> renvoie un jeton signé prouvant la propriété de l'e-mail
route('POST', '/api/agencies/verification/check', function () {
    $in = input();
    $challenge = trim((string) ($in['challenge'] ?? ''));
    $code = (string) ($in['code'] ?? '');
    $row = otp_check($challenge, $code, 'agency_registration');

    $proof = signed_make(['purpose' => 'agency_email_verified', 'email' => $row['email']], 1800);
    json_out(['verified' => true, 'email' => $row['email'], 'verification_token' => $proof]);
});

// Enregistrement complet de l'agence + Audit IA automatique + Escalade propriétaire si anomalie
route('POST', '/api/agencies/register', function () {
    rate_limit('ag_reg:ip:' . client_ip(), 6, 900);
    $in = input();
    $a = $in['agency'] ?? [];
    $o = $in['owner'] ?? [];
    $proofToken = (string) ($in['verification_token'] ?? '');

    $name = str_in($a['name'] ?? '', 120);
    $email = strtolower(trim((string) ($a['email'] ?? '')));
    $phone = str_in($a['phone'] ?? '', 25);
    $legalId = str_in($a['legal_id'] ?? '', 60);
    $cityName = str_in($a['city_name'] ?? '', 80) ?: null;
    $address = str_in($a['address'] ?? '', 255);
    $addressNorm = normalize_agency_address($address);
    $color = strtoupper((string) ($a['primary_color'] ?? '#8C6BB8'));

    $ownerEmail = strtolower(trim((string) ($o['email'] ?? '')));
    $ownerFirst = str_in($o['first_name'] ?? '', 80);
    $ownerLast = str_in($o['last_name'] ?? '', 80);
    $password = (string) ($o['password'] ?? '');
    $contractAccepted = filter_var($in['contract_accepted'] ?? ($a['contract_accepted'] ?? false), FILTER_VALIDATE_BOOLEAN);

    $payoutMethod = strtolower(trim((string) ($a['payout_method'] ?? 'orange_money')));
    if (!in_array($payoutMethod, ['orange_money', 'mtn_momo', 'wave', 'bank_transfer', 'card'], true)) {
        $payoutMethod = 'orange_money';
    }
    $payoutNumber = str_in($a['payout_account_number'] ?? ($phone ?: ''), 80);
    $payoutName = str_in($a['payout_account_name'] ?? $name, 120);

    if ($name === '') fail(422, 'invalid_name', 'Le nom de l\'agence est obligatoire.');
    if (!$contractAccepted) {
        fail(422, 'contract_required', 'Vous devez lire et accepter les termes du Contrat de Partenariat VELTRON (commission automatique de 0,5 % sur le montant totalisé de chaque voyage).');
    }
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !filter_var($ownerEmail, FILTER_VALIDATE_EMAIL)) {
        fail(422, 'invalid_email', 'Adresse e-mail invalide.');
    }

    // Preuve cryptographique que le créateur a bien saisi le code PIN à 5 chiffres reçu par e-mail
    $proof = signed_read($proofToken);
    if (!$proof || ($proof['purpose'] ?? '') !== 'agency_email_verified'
        || !in_array($proof['email'] ?? '', [$ownerEmail, $email], true)) {
        fail(422, 'email_not_verified', 'Veuillez d\'abord confirmer votre adresse e-mail avec le code PIN à 5 chiffres.');
    }

    if (strlen($address) < 10 || strlen($addressNorm) < 6) {
        fail(422, 'invalid_address', 'Adresse physique complète requise (ville, quartier, rue et repère).');
    }
    if (one('SELECT id FROM agencies WHERE address_normalized = ?', [$addressNorm])) {
        fail(409, 'address_duplicate', 'Deux agences ne peuvent pas partager la même adresse physique.');
    }
    if (one('SELECT id FROM agencies WHERE email = ?', [$email])) {
        fail(409, 'agency_email_taken', 'Cette adresse e-mail d\'agence est déjà enregistrée.');
    }
    if (one('SELECT id FROM users WHERE email = ?', [$ownerEmail])) {
        fail(409, 'owner_email_taken', 'L\'adresse e-mail du responsable possède déjà un compte.');
    }
    if (!preg_match('/^#[0-9A-F]{6}$/', $color)) fail(422, 'invalid_color', 'Couleur invalide (format #RRGGBB).');
    if (strlen($password) < 8) fail(422, 'weak_password', 'Mot de passe : 8 caractères minimum.');

    $country = one('SELECT id, name_fr, phone_prefix FROM countries WHERE id = ?', [(int) ($a['country_id'] ?? 0)])
        ?? fail(422, 'invalid_country', 'Pays invalide.');
    $currency = one('SELECT code FROM currencies WHERE code = ?', [strtoupper((string) ($a['currency_code'] ?? ''))])
        ?? fail(422, 'invalid_currency', 'Devise invalide.');

    // Audit automatique IA + règles de sécurité
    $verdict = verify_agency_application([
        'name' => $name,
        'legal_id' => $legalId,
        'email' => $email,
        'phone' => $phone,
        'address' => $address,
        'country_name' => $country['name_fr'],
        'phone_prefix' => $country['phone_prefix'],
        'owner_first' => $ownerFirst,
        'owner_last' => $ownerLast,
    ]);

    $slug = slugify($name);
    for ($i = 2; one('SELECT id FROM agencies WHERE slug = ?', [$slug]); $i++) $slug = slugify($name) . "-$i";
    $publicCode = generate_agency_code();

    $agencyId = transaction(function () use (
        $ownerEmail, $password, $ownerFirst, $ownerLast, $phone, $publicCode, $slug, $name,
        $country, $cityName, $currency, $color, $legalId, $email, $address, $addressNorm, $verdict,
        $payoutMethod, $payoutNumber, $payoutName
    ) {
        $algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
        q('INSERT INTO users (email, phone, password_hash, first_name, last_name) VALUES (?,?,?,?,?)',
            [$ownerEmail, $phone ?: null, password_hash($password, $algo),
             $ownerFirst ?: 'Administrateur', $ownerLast ?: $name]);
        $userId = (int) db()->lastInsertId();

        $rateBps = (int) (env('PLATFORM_COMMISSION_BPS', '50') ?: 50);
        q('INSERT INTO agencies (public_code, slug, name, country_id, city_name, currency_code, primary_color, legal_id,
                                 email, phone, address, address_normalized, verification_status, verification_score,
                                 verification_report, verified_at, registered_ip, status, commission_rate_bps, contract_accepted_at,
                                 payout_method, payout_account_number, payout_account_name)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, IF(? = 1, UTC_TIMESTAMP(), NULL), ?, ?, ?, UTC_TIMESTAMP(), ?, ?, ?)',
            [$publicCode, $slug, $name, $country['id'], $cityName, $currency['code'], $color,
             $legalId ?: null, $email, $phone ?: null, $address, $addressNorm,
             $verdict['verification_status'], $verdict['score'],
             json_encode($verdict, JSON_UNESCAPED_UNICODE),
             $verdict['approved'] ? 1 : 0, client_ip(), $verdict['agency_status'], $rateBps,
             $payoutMethod, $payoutNumber ?: null, $payoutName ?: null]);
        $agencyId = (int) db()->lastInsertId();

        q("INSERT INTO agency_staff (agency_id, user_id, role, job_title) VALUES (?,?, 'owner', 'Administrateur')",
            [$agencyId, $userId]);
        q('INSERT INTO refund_tiers (agency_id, min_minutes_before, refund_percent) VALUES (?,1440,100),(?,360,70),(?,120,50)',
            [$agencyId, $agencyId, $agencyId]);
        q("INSERT INTO loyalty_rewards (agency_id, title, description, points_required) VALUES
            (?, 'Bagage 10 kg offert', 'Sur un prochain trajet', 30),
            (?, 'Voyage offert', 'Un billet aller simple gratuit', 100)",
            [$agencyId, $agencyId]);

        // Création automatique des salons de discussion d'équipe (en clair pour toute l'équipe de l'agence)
        q("INSERT INTO chat_groups (agency_id, name, description, kind, theme, created_by)
           VALUES (?, ?, 'Salon général de toute l''équipe de l''agence', 'general', 'aurora', ?)",
            [$agencyId, "Équipe $name", $userId]);
        $g1 = (int) db()->lastInsertId();
        q('INSERT INTO chat_members (group_id, user_id, is_admin) VALUES (?,?,1)', [$g1, $userId]);
        q("INSERT INTO chat_messages (group_id, sender_user_id, kind, ciphertext) VALUES (?, ?, 'system', ?)",
            [$g1, $userId, "Bienvenue dans l'espace d'échange de l'équipe « $name ». Tous les membres de l'agence voient ces messages."]);

        q("INSERT INTO chat_groups (agency_id, name, description, kind, theme, created_by)
           VALUES (?, 'Chauffeurs & Programmation', 'Suivi des départs, retards et incidents', 'custom', 'whatsapp', ?)",
            [$agencyId, $userId]);
        $g2 = (int) db()->lastInsertId();
        q('INSERT INTO chat_members (group_id, user_id, is_admin) VALUES (?,?,1)', [$g2, $userId]);

        audit($userId, $agencyId, 'agency.register', 'agency', $agencyId, [
            'public_code' => $publicCode, 'score' => $verdict['score'], 'approved' => $verdict['approved'],
        ]);
        return $agencyId;
    });

    // Envoi de l'ID généré automatiquement au créateur
    send_veltron_mail($ownerEmail,
        "Bienvenue sur VELTRON – Identifiant de votre agence : {$publicCode}",
        "Bonjour {$ownerFirst},\n\nVotre agence « {$name} » a été enregistrée.\n"
        . "CONSERVEZ PRÉCIEUSEMENT VOTRE IDENTIFIANT AGENCE : {$publicCode}\n"
        . "Vous en aurez besoin (avec le nom de l'agence et votre e-mail) pour accéder à « J'ai une agence ».\n\n"
        . "Statut de vérification IA : {$verdict['summary']}\n");

    // Si la vérification automatique n'a pas pu valider à 100%, alerte immédiate au propriétaire VELTRON !
    if (!$verdict['approved']) {
        $flagsText = implode("\n - ", $verdict['flags'] ?: ['Score inférieur au seuil automatique (75/100)']);
        alert_platform_owner(
            'agency_review',
            "Vérification requise : {$name} ({$publicCode}) – Score {$verdict['score']}/100",
            "Le système IA VELTRON a placé l'agence « {$name} » ({$publicCode}) en revue manuelle.\n\n"
            . "Points relevés :\n - {$flagsText}\n\n"
            . "Adresse déclarée : {$address} ({$country['name_fr']})\n"
            . "Responsable : {$ownerFirst} {$ownerLast} ({$ownerEmail})",
            $agencyId,
            ['email' => $email, 'owner_email' => $ownerEmail, 'phone' => $phone, 'name' => $name]
        );
    }

    json_out([
        'public_code' => $publicCode,
        'slug' => $slug,
        'status' => $verdict['agency_status'],
        'verification_status' => $verdict['verification_status'],
        'verification_score' => $verdict['score'],
        'verification_report' => $verdict,
        'commission_rate_bps' => (int) (env('PLATFORM_COMMISSION_BPS', '50') ?: 50),
    ], 201);
});

// =============================================================================
// SUPERVISION PROPRIÉTAIRE VELTRON (Vous : validation des cas escaladés par l'IA)
// =============================================================================
route('GET', '/api/platform/public-status', function () {
    json_out([
        'password_customized' => get_platform_setting('password_customized', '0') === '1',
    ]);
});

route('GET', '/api/platform/overview', function () {
    $admin = require_platform_admin();
    $status = (string) ($_GET['status'] ?? '');
    $agencies = all("SELECT a.id, a.public_code, a.slug, a.name, a.status, a.verification_status,
                            a.verification_score, a.verification_report, a.email, a.phone, a.address,
                            a.legal_id, a.currency_code, a.commission_rate_bps, a.contract_accepted_at,
                            a.payout_method, a.payout_account_number, a.payout_account_name, a.wallet_balance,
                            a.created_at, c.name_fr AS country_name, c.iso2 AS country
                     FROM agencies a JOIN countries c ON c.id = a.country_id
                     WHERE (? = '' OR a.status = ?)
                     ORDER BY FIELD(a.status, 'pending','active','suspended'), a.created_at DESC", [$status, $status]);

    foreach ($agencies as &$ag) {
        $ag['verification_report'] = $ag['verification_report'] ? json_decode($ag['verification_report'], true) : null;
        $ag['created_at'] = iso($ag['created_at']);
        $ag['contract_accepted_at'] = iso($ag['contract_accepted_at']);
        $ag['commission_rate_bps'] = (int) ($ag['commission_rate_bps'] ?? 50);
        $ag['wallet_balance'] = (int) ($ag['wallet_balance'] ?? 0);
        $digits = clean_phone_digits($ag['phone']);
        $ag['whatsapp_url'] = $digits !== ''
            ? 'https://wa.me/' . $digits . '?text=' . rawurlencode("Bonjour {$ag['name']}, ici la direction VELTRON concernant votre dossier {$ag['public_code']}.")
            : null;
        $ag['mailto_url'] = 'mailto:' . rawurlencode($ag['email']) . '?subject=' . rawurlencode("VELTRON – Dossier agence {$ag['public_code']}");
    }

    $alerts = all("SELECT id, agency_id, kind, title, body, channels, resolved_at, created_at
                   FROM platform_alerts ORDER BY (resolved_at IS NOT NULL), id DESC LIMIT 40");
    foreach ($alerts as &$al) {
        $al['channels'] = $al['channels'] ? json_decode($al['channels'], true) : null;
        $al['created_at'] = iso($al['created_at']);
        $al['resolved_at'] = iso($al['resolved_at']);
    }

    $commissions = all("SELECT pc.id, pc.trip_id, pc.agency_id, pc.seats_filled, pc.seat_capacity, pc.is_full_bus,
                               pc.gross_amount, pc.rate_bps, pc.commission_amount, pc.currency_code, pc.trigger_event,
                               pc.status, pc.settled_at,
                               a.name AS agency_name, a.public_code, a.public_code AS agency_code,
                               co.name AS origin, cd.name AS destination, t.departs_at,
                               cu.symbol, cu.minor_units
                        FROM platform_commissions pc
                        JOIN agencies a ON a.id = pc.agency_id
                        JOIN trips t ON t.id = pc.trip_id
                        JOIN routes r ON r.id = t.route_id
                        JOIN cities co ON co.id = r.origin_city_id
                        JOIN cities cd ON cd.id = r.dest_city_id
                        JOIN currencies cu ON cu.code = pc.currency_code
                        ORDER BY pc.settled_at DESC, pc.id DESC LIMIT 60");
    foreach ($commissions as &$cm) {
        $cm['id'] = (int) $cm['id'];
        $cm['trip_id'] = (int) $cm['trip_id'];
        $cm['seats_filled'] = (int) $cm['seats_filled'];
        $cm['seat_capacity'] = (int) $cm['seat_capacity'];
        $cm['is_full_bus'] = (bool) $cm['is_full_bus'];
        $cm['gross_amount'] = (int) $cm['gross_amount'];
        $cm['rate_bps'] = (int) $cm['rate_bps'];
        $cm['commission_amount'] = (int) $cm['commission_amount'];
        $cm['minor_units'] = (int) $cm['minor_units'];
        $cm['settled_at'] = iso($cm['settled_at']);
        $cm['departs_at'] = iso($cm['departs_at']);
    }

    $totals = all("SELECT pc.currency_code, cu.symbol, cu.minor_units,
                          COUNT(*) AS trips_count,
                          COALESCE(SUM(pc.gross_amount), 0) AS total_gross,
                          COALESCE(SUM(pc.commission_amount), 0) AS total_commission
                   FROM platform_commissions pc
                   JOIN currencies cu ON cu.code = pc.currency_code
                   GROUP BY pc.currency_code, cu.symbol, cu.minor_units");
    foreach ($totals as &$tot) {
        $tot['trips_count'] = (int) $tot['trips_count'];
        $tot['total_gross'] = (int) $tot['total_gross'];
        $tot['total_commission'] = (int) $tot['total_commission'];
        $tot['minor_units'] = (int) $tot['minor_units'];
    }

    $ownerMethod = get_platform_setting('owner_payout_method', 'orange_money');
    $ownerNumber = get_platform_setting('owner_payout_number', '');
    $ownerName   = get_platform_setting('owner_payout_name', env('OWNER_PAYOUT_ACCOUNT', 'VELTRON OWNER - Nathan Zoua'));

    json_out([
        'agencies' => $agencies,
        'alerts' => $alerts,
        'commissions' => $commissions,
        'commission_totals' => $totals,
        'owner_account' => $ownerName . ($ownerNumber ? " ($ownerMethod : $ownerNumber)" : ''),
        'commission_rate_bps' => (int) (env('PLATFORM_COMMISSION_BPS', '50') ?: 50),
        'owner_settings' => [
            'email' => $admin['email'],
            'payout_method' => $ownerMethod,
            'payout_number' => $ownerNumber,
            'payout_name' => $ownerName,
            'password_customized' => get_platform_setting('password_customized', '0') === '1',
        ],
    ]);
});

// Personnalisation du vrai mot de passe Propriétaire & du compte de réception des commissions 0,5 %
route('POST', '/api/platform/account/update', function () {
    $admin = require_platform_admin();
    $in = input();

    if (isset($in['payout_method']) || isset($in['payout_number']) || isset($in['payout_name'])) {
        $pm = strtolower(trim((string) ($in['payout_method'] ?? 'orange_money')));
        if (!in_array($pm, ['orange_money', 'mtn_momo', 'wave', 'bank_transfer', 'card'], true)) $pm = 'orange_money';
        $pn = str_in($in['payout_number'] ?? '', 80);
        $pname = str_in($in['payout_name'] ?? 'Nathan Zoua (Propriétaire VELTRON)', 120);
        set_platform_setting('owner_payout_method', $pm);
        set_platform_setting('owner_payout_number', $pn);
        set_platform_setting('owner_payout_name', $pname);
    }

    $newPassword = (string) ($in['new_password'] ?? '');
    $currentPassword = (string) ($in['current_password'] ?? '');
    $newEmail = strtolower(trim((string) ($in['new_email'] ?? '')));

    if ($newPassword !== '') {
        if (strlen($newPassword) < 8) {
            fail(422, 'weak_password', 'Votre nouveau mot de passe doit contenir au moins 8 caractères.');
        }
        $userRow = one('SELECT id, password_hash FROM users WHERE id = ?', [(int) $admin['user_id']]);
        if (!$userRow || !password_verify($currentPassword, (string) $userRow['password_hash'])) {
            fail(403, 'wrong_current_password', 'Le mot de passe actuel saisi est incorrect.');
        }
        $algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
        $hash = password_hash($newPassword, $algo);
        // Met à jour tous les comptes super_admin du propriétaire pour qu'aucun mot de passe par défaut ne subsiste
        q("UPDATE users SET password_hash = ?, is_seed = 0 WHERE platform_role = 'super_admin'", [$hash]);
        set_platform_setting('password_customized', '1');
    }

    if ($newEmail !== '' && filter_var($newEmail, FILTER_VALIDATE_EMAIL) && $newEmail !== $admin['email']) {
        q('UPDATE users SET email = ? WHERE id = ?', [$newEmail, (int) $admin['user_id']]);
    }

    audit((int) $admin['user_id'], null, 'platform.account_update', 'user', (int) $admin['user_id'], [
        'password_changed' => $newPassword !== '',
    ]);
    json_out(['ok' => true, 'password_customized' => get_platform_setting('password_customized', '0') === '1']);
});

route('POST', '/api/platform/agencies/{id}/decision', function (array $p) {
    $admin = require_platform_admin();
    $decision = (string) (input()['decision'] ?? '');
    $note = str_in(input()['note'] ?? '', 500);
    if (!in_array($decision, ['approve', 'reject', 'suspend'], true)) fail(422, 'invalid_decision', 'Décision invalide.');

    $agency = one('SELECT id, name, email, public_code FROM agencies WHERE id = ?', [(int) $p['id']])
        ?? fail(404, 'not_found', 'Agence introuvable.');

    if ($decision === 'approve') {
        q("UPDATE agencies SET status = 'active', verification_status = 'approved', verified_at = UTC_TIMESTAMP() WHERE id = ?", [$agency['id']]);
        q('UPDATE platform_alerts SET resolved_at = UTC_TIMESTAMP() WHERE agency_id = ? AND resolved_at IS NULL', [$agency['id']]);
        send_veltron_mail($agency['email'], "Agence validée sur VELTRON ({$agency['public_code']})",
            "Bonne nouvelle ! Votre agence « {$agency['name']} » est désormais active dans l'annuaire VELTRON.\n" . ($note ? "Note : $note\n" : ''));
    } elseif ($decision === 'reject') {
        q("UPDATE agencies SET status = 'suspended', verification_status = 'rejected' WHERE id = ?", [$agency['id']]);
        q('UPDATE platform_alerts SET resolved_at = UTC_TIMESTAMP() WHERE agency_id = ? AND resolved_at IS NULL', [$agency['id']]);
    } else {
        q("UPDATE agencies SET status = 'suspended' WHERE id = ?", [$agency['id']]);
        q("UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE realm = 'agency' AND agency_id = ?", [$agency['id']]);
    }

    audit((int) $admin['id'], (int) $agency['id'], 'platform.agency_' . $decision, 'agency', (int) $agency['id'], ['note' => $note]);
    json_out(['ok' => true]);
});
