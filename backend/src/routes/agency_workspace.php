<?php
declare(strict_types=1);

// =============================================================================
// Espace Agence : gestion par rôle (owner, manager, secretary, driver, staff, accountant)
// Chaque rôle n'accède strictement qu'à ses fonctions autorisées et à son agence.
// =============================================================================

// ---------- Tableau de bord adapté au rôle ----------
route('GET', '/api/agency/dashboard', function () {
    $s = require_agency();
    $aid = $s['agency_id'];

    $stats = [
        'buses_count' => (int) (one('SELECT COUNT(*) AS n FROM buses WHERE agency_id = ? AND status <> "archived"', [$aid])['n'] ?? 0),
        'routes_count' => (int) (one('SELECT COUNT(*) AS n FROM routes WHERE agency_id = ?', [$aid])['n'] ?? 0),
        'upcoming_trips' => (int) (one("SELECT COUNT(*) AS n FROM trips WHERE agency_id = ? AND status IN ('scheduled','boarding') AND departs_at > UTC_TIMESTAMP()", [$aid])['n'] ?? 0),
        'active_trips' => (int) (one("SELECT COUNT(*) AS n FROM trips WHERE agency_id = ? AND status = 'departed'", [$aid])['n'] ?? 0),
        'staff_count' => (int) (one("SELECT COUNT(*) AS n FROM agency_staff WHERE agency_id = ? AND status = 'active'", [$aid])['n'] ?? 0),
        'tickets_today' => (int) (one("SELECT COUNT(*) AS n FROM tickets k JOIN trips t ON t.id = k.trip_id
                                       WHERE t.agency_id = ? AND k.status IN ('valid','boarded')
                                         AND COALESCE(k.boarded_at, k.checked_in_at) >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)", [$aid])['n'] ?? 0),
    ];

    if (in_array($s['role'], ['owner', 'accountant'], true)) {
        $stats['revenue_total'] = (int) (one("SELECT COALESCE(SUM(p.amount), 0) AS s FROM payments p
                                              JOIN bookings b ON b.id = p.booking_id
                                              WHERE b.agency_id = ? AND p.status = 'succeeded'", [$aid])['s'] ?? 0);
    }

    json_out(['role' => $s['role'], 'stats' => $stats]);
});

// ---------- Paramètres de l'agence (owner uniquement) ----------
route('POST', '/api/agency/settings', function () {
    $s = require_agency(['owner']);
    $in = input();
    $fillWindow = max(5, min(240, (int) ($in['fill_window_minutes'] ?? 40)));
    $cutoff = max(120, min(2880, (int) ($in['refund_cutoff_minutes'] ?? 120)));
    $freeKg = max(0, min(100, (float) ($in['free_baggage_kg'] ?? 20)));
    $bagFee = max(0, (int) ($in['baggage_fee_per_kg'] ?? 0));
    $transferFee = max(0, (int) ($in['transfer_fee'] ?? 0));
    $pts = max(1, min(500, (int) ($in['points_per_trip'] ?? 10)));
    $color = strtoupper((string) ($in['primary_color'] ?? '#8C6BB8'));
    if (!preg_match('/^#[0-9A-F]{6}$/', $color)) fail(422, 'invalid_color', 'Couleur invalide.');

    q('UPDATE agencies SET fill_window_minutes = ?, refund_cutoff_minutes = ?, free_baggage_kg = ?,
                           baggage_fee_per_kg = ?, transfer_fee = ?, points_per_trip = ?, primary_color = ?
       WHERE id = ?', [$fillWindow, $cutoff, $freeKg, $bagFee, $transferFee, $pts, $color, $s['agency_id']]);
    audit((int) $s['id'], $s['agency_id'], 'agency.settings_update', 'agency', $s['agency_id']);
    json_out(['ok' => true]);
});

// ---------- Comptes du personnel (owner uniquement : création & révocation instantanée) ----------
route('GET', '/api/agency/staff', function () {
    $s = require_agency(['owner', 'manager']);
    $rows = all("SELECT st.user_id, st.role, st.job_title, st.custom_role, st.matricule, st.avatar_url, st.status, st.last_login_at,
                        u.email, u.first_name, u.last_name, u.phone,
                        d.id AS driver_id, d.availability, d.mood, d.mood_note
                 FROM agency_staff st
                 JOIN users u ON u.id = st.user_id
                 LEFT JOIN drivers d ON d.agency_id = st.agency_id AND d.user_id = st.user_id
                 WHERE st.agency_id = ?
                 ORDER BY FIELD(st.role, 'owner','manager','secretary','accountant','driver','staff'), u.first_name",
        [$s['agency_id']]);
    foreach ($rows as &$r) $r['last_login_at'] = iso($r['last_login_at']);
    json_out($rows);
});

route('POST', '/api/agency/staff', function () {
    $s = require_agency(['owner']);
    $in = input();
    $role = (string) ($in['role'] ?? '');
    if (!in_array($role, ['manager', 'secretary', 'driver', 'staff', 'accountant'], true)) {
        fail(422, 'invalid_role', 'Choisissez un rôle valide (programmation, secrétaire, chauffeur, personnel, comptable).');
    }
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    $first = str_in($in['first_name'] ?? '', 80);
    $last = str_in($in['last_name'] ?? '', 80);
    $phone = str_in($in['phone'] ?? '', 25) ?: null;
    $jobTitle = str_in($in['job_title'] ?? '', 80) ?: null;
    $customRole = str_in($in['custom_role'] ?? $jobTitle ?? '', 100) ?: null;
    $password = (string) ($in['password'] ?? '');

    // Génération automatique du matricule unique s'il n'est pas fourni manuellement
    $prefix = match ($role) {
        'secretary'  => 'SEC',
        'driver'     => 'CHAUF',
        'manager'    => 'PRG',
        'accountant' => 'CPT',
        default      => 'STF',
    };
    $countStaff = (int) (one("SELECT COUNT(*) AS c FROM agency_staff WHERE agency_id = ? AND role = ?", [$s['agency_id'], $role])['c'] ?? 0) + 1;
    $matricule = strtoupper(trim((string) ($in['matricule'] ?? ''))) ?: sprintf('AG%d-%s-%02d', (int) $s['agency_id'], $prefix, $countStaff);
    $avatarUrl = str_in($in['avatar_url'] ?? '', 500000) ?: null;

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail(422, 'invalid_email', 'E-mail invalide.');
    if ($first === '' || $last === '') fail(422, 'invalid_name', 'Prénom et nom requis.');
    if (strlen($password) < 8) fail(422, 'weak_password', 'Mot de passe personnel : 8 caractères minimum.');
    if (one('SELECT id FROM users WHERE email = ?', [$email])) {
        fail(409, 'email_taken', 'Cette adresse e-mail possède déjà un compte VELTRON.');
    }

    $userId = transaction(function () use ($s, $role, $email, $first, $last, $phone, $jobTitle, $customRole, $matricule, $avatarUrl, $password) {
        $algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
        q('INSERT INTO users (email, phone, password_hash, first_name, last_name, avatar_url) VALUES (?,?,?,?,?,?)',
            [$email, $phone, password_hash($password, $algo), $first, $last, $avatarUrl]);
        $uid = (int) db()->lastInsertId();

        q('INSERT INTO agency_staff (agency_id, user_id, role, job_title, custom_role, matricule, avatar_url, invited_by) VALUES (?,?,?,?,?,?,?,?)',
            [$s['agency_id'], $uid, $role, $jobTitle, $customRole, $matricule, $avatarUrl, $s['id']]);

        if ($role === 'driver') {
            q('INSERT INTO drivers (agency_id, user_id, photo_consent, licence_verified) VALUES (?,?, 1, 1)',
                [$s['agency_id'], $uid]);
        }

        // Ajout automatique au groupe général chiffré de l'agence
        $gen = one("SELECT id FROM chat_groups WHERE agency_id = ? AND kind = 'general' LIMIT 1", [$s['agency_id']]);
        if ($gen) q('INSERT IGNORE INTO chat_members (group_id, user_id, is_admin) VALUES (?,?,0)', [$gen['id'], $uid]);

        audit((int) $s['id'], $s['agency_id'], 'staff.create', 'user', $uid, ['role' => $role, 'matricule' => $matricule]);
        return $uid;
    });

    json_out(['user_id' => $userId, 'role' => $role, 'matricule' => $matricule], 201);
});

route('POST', '/api/agency/staff/{userId}/toggle', function (array $p) {
    $s = require_agency(['owner']);
    $targetUid = (int) $p['userId'];
    if ($targetUid === (int) $s['id']) fail(422, 'self_disable', 'Vous ne pouvez pas désactiver votre propre compte administrateur.');

    $row = one('SELECT role, status FROM agency_staff WHERE agency_id = ? AND user_id = ?', [$s['agency_id'], $targetUid])
        ?? fail(404, 'not_found', 'Membre introuvable.');
    $next = $row['status'] === 'active' ? 'disabled' : 'active';
    q('UPDATE agency_staff SET status = ? WHERE agency_id = ? AND user_id = ?', [$next, $s['agency_id'], $targetUid]);
    if ($next === 'disabled') {
        q("UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE realm = 'agency' AND agency_id = ? AND user_id = ?",
            [$s['agency_id'], $targetUid]);
    }
    audit((int) $s['id'], $s['agency_id'], 'staff.' . $next, 'user', $targetUid);
    json_out(['status' => $next]);
});

// ---------- Flotte (bus + génération automatique des sièges) ----------
route('GET', '/api/agency/buses', function () {
    $s = require_agency(['owner', 'manager', 'secretary']);
    $rows = all('SELECT id, plate, label, bus_type, seat_count, avg_speed_kmh, has_gps, gps_device_id, layout, status
                 FROM buses WHERE agency_id = ? ORDER BY id DESC', [$s['agency_id']]);
    foreach ($rows as &$r) {
        $r['has_gps'] = (bool) ($r['has_gps'] ?? false);
        $r['layout'] = json_decode($r['layout'], true);
    }
    json_out($rows);
});

route('POST', '/api/agency/buses', function () {
    $s = require_agency(['owner', 'manager']);
    $in = input();
    $plate = strtoupper(str_in($in['plate'] ?? '', 20));
    $label = str_in($in['label'] ?? '', 80);
    $type = in_array($in['bus_type'] ?? '', ['standard', 'vip', 'minibus', 'coach'], true) ? $in['bus_type'] : 'coach';
    $left = max(1, min(3, (int) ($in['cols_left'] ?? 2)));
    $right = max(1, min(3, (int) ($in['cols_right'] ?? 2)));
    $rows = max(4, min(18, (int) ($in['rows'] ?? 10)));
    $vipRows = max(0, min($rows, (int) ($in['vip_rows'] ?? 0)));
    $speed = max(40, min(130, (int) ($in['avg_speed_kmh'] ?? 70)));
    $hasGps = !empty($in['has_gps']) ? 1 : 0;
    $gpsDeviceId = str_in($in['gps_device_id'] ?? '', 60) ?: null;

    if ($plate === '' || $label === '') fail(422, 'invalid_fields', 'Immatriculation et nom du bus requis.');
    $perRow = $left + $right;
    $seatCount = $rows * $perRow;
    $layout = json_encode(['seats_per_row' => [$left, $right]]);

    $busId = transaction(function () use ($s, $plate, $label, $type, $seatCount, $speed, $hasGps, $gpsDeviceId, $layout, $rows, $perRow, $vipRows) {
        try {
            q('INSERT INTO buses (agency_id, plate, label, bus_type, seat_count, avg_speed_kmh, has_gps, gps_device_id, layout) VALUES (?,?,?,?,?,?,?,?,?)',
                [$s['agency_id'], $plate, $label, $type, $seatCount, $speed, $hasGps, $gpsDeviceId, $layout]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail(409, 'plate_taken', 'Cette immatriculation existe déjà dans votre flotte.');
            throw $e;
        }
        $busId = (int) db()->lastInsertId();
        $seatNo = 1;
        for ($r = 1; $r <= $rows; $r++) {
            $cls = $r <= $vipRows ? 'vip' : 'standard';
            for ($c = 1; $c <= $perRow; $c++) {
                q('INSERT INTO seats (bus_id, seat_no, row_no, col_no, seat_class) VALUES (?,?,?,?,?)',
                    [$busId, $seatNo++, $r, $c, $cls]);
            }
        }
        audit((int) $s['id'], $s['agency_id'], 'bus.create', 'bus', $busId, ['plate' => $plate, 'seats' => $seatCount]);
        return $busId;
    });

    json_out(['id' => $busId, 'seat_count' => $seatCount], 201);
});

// ---------- Lignes (villes créées à la volée dans le pays de l'agence si besoin) ----------
function resolve_agency_city(int $countryId, string $name, string $defaultTz): int
{
    $name = str_in($name, 80);
    if ($name === '') fail(422, 'invalid_city', 'Nom de ville requis.');
    $existing = one('SELECT id FROM cities WHERE country_id = ? AND LOWER(name) = LOWER(?)', [$countryId, $name]);
    if ($existing) return (int) $existing['id'];
    q('INSERT INTO cities (country_id, name, timezone) VALUES (?,?,?)', [$countryId, $name, $defaultTz]);
    return (int) db()->lastInsertId();
}

route('GET', '/api/agency/routes', function () {
    $s = require_agency(['owner', 'manager', 'secretary']);
    json_out(all('SELECT r.id, oc.name AS origin, dc.name AS destination, r.distance_km, r.duration_min
                  FROM routes r
                  JOIN cities oc ON oc.id = r.origin_city_id
                  JOIN cities dc ON dc.id = r.dest_city_id
                  WHERE r.agency_id = ? ORDER BY oc.name, dc.name', [$s['agency_id']]));
});

route('POST', '/api/agency/routes', function () {
    $s = require_agency(['owner', 'manager']);
    $in = input();
    $ag = one('SELECT country_id FROM agencies WHERE id = ?', [$s['agency_id']]);
    $tzRow = one('SELECT timezone FROM cities WHERE country_id = ? LIMIT 1', [$ag['country_id']]);
    $tz = $tzRow['timezone'] ?? 'Africa/Douala';

    $origId = resolve_agency_city((int) $ag['country_id'], (string) ($in['origin_name'] ?? ''), $tz);
    $destId = resolve_agency_city((int) $ag['country_id'], (string) ($in['dest_name'] ?? ''), $tz);
    if ($origId === $destId) fail(422, 'same_city', 'La ville de départ et d\'arrivée doivent être différentes.');

    $dist = max(5, min(5000, (int) ($in['distance_km'] ?? 200)));
    $dur = max(15, min(4320, (int) ($in['duration_min'] ?? 180)));

    try {
        q('INSERT INTO routes (agency_id, origin_city_id, dest_city_id, distance_km, duration_min) VALUES (?,?,?,?,?)',
            [$s['agency_id'], $origId, $destId, $dist, $dur]);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') fail(409, 'route_exists', 'Cette ligne existe déjà dans votre agence.');
        throw $e;
    }
    json_out(['id' => (int) db()->lastInsertId()], 201);
});

// ---------- Programmation des voyages (horaires, places réservées, report de voyage) ----------
route('GET', '/api/agency/trips', function () {
    $s = require_agency(['owner', 'manager', 'secretary', 'staff']);
    expire_holds();

    $trips = all("SELECT t.id, t.route_id, t.bus_id, t.departs_at, t.arrives_at, t.price, t.vip_price,
                         t.status, t.delay_minutes, t.postponed_from, t.actual_departed_at, t.actual_arrived_at,
                         oc.name AS origin, dc.name AS destination, oc.timezone,
                         b.label AS bus_label, b.plate, b.seat_count, b.has_gps, b.gps_device_id,
                         (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.active_seat_id IS NOT NULL) AS reserved_seats,
                         (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status = 'boarded') AS boarded_seats,
                         (SELECT GROUP_CONCAT(u.first_name SEPARATOR ', ')
                          FROM trip_drivers td JOIN drivers d ON d.id = td.driver_id JOIN users u ON u.id = d.user_id
                          WHERE td.trip_id = t.id) AS driver_names
                  FROM trips t
                  JOIN routes r ON r.id = t.route_id
                  JOIN cities oc ON oc.id = r.origin_city_id
                  JOIN cities dc ON dc.id = r.dest_city_id
                  JOIN buses b ON b.id = t.bus_id
                  WHERE t.agency_id = ?
                  ORDER BY t.departs_at DESC LIMIT 80", [$s['agency_id']]);
    foreach ($trips as &$t) {
        $t['has_gps'] = (bool) ($t['has_gps'] ?? false);
        $t['departs_at'] = iso($t['departs_at']);
        $t['arrives_at'] = iso($t['arrives_at']);
        $t['postponed_from'] = iso($t['postponed_from']);
        $t['actual_departed_at'] = iso($t['actual_departed_at']);
        $t['actual_arrived_at'] = iso($t['actual_arrived_at']);
    }
    json_out($trips);
});

route('GET', '/api/agency/drivers', function () {
    $s = require_agency(['owner', 'manager', 'secretary']);
    json_out(all("SELECT d.id, d.availability, d.mood, d.mood_note, u.first_name, u.last_name, u.phone
                  FROM drivers d JOIN users u ON u.id = d.user_id
                  WHERE d.agency_id = ? AND d.status = 'active' ORDER BY u.first_name", [$s['agency_id']]));
});

route('POST', '/api/agency/trips', function () {
    $s = require_agency(['owner', 'manager', 'secretary']);
    $in = input();
    $routeId = (int) ($in['route_id'] ?? 0);
    $busId = (int) ($in['bus_id'] ?? 0);
    $driverId = !empty($in['driver_id']) ? (int) $in['driver_id'] : null;
    $price = max(1, (int) ($in['price'] ?? 0));
    $vipPrice = !empty($in['vip_price']) ? max($price, (int) $in['vip_price']) : null;
    $localDepart = trim((string) ($in['departs_local'] ?? ''));

    $route = one('SELECT r.id, r.duration_min, oc.timezone FROM routes r JOIN cities oc ON oc.id = r.origin_city_id
                  WHERE r.id = ? AND r.agency_id = ?', [$routeId, $s['agency_id']])
        ?? fail(422, 'invalid_route', 'Ligne invalide.');
    $bus = one("SELECT id FROM buses WHERE id = ? AND agency_id = ? AND status = 'available'", [$busId, $s['agency_id']])
        ?? fail(422, 'invalid_bus', 'Bus invalide ou indisponible.');

    $departsUtc = local_to_utc($localDepart, $route['timezone']);
    if (strtotime($departsUtc . ' UTC') <= time()) fail(422, 'past_date', 'L\'heure de départ doit être dans le futur.');
    $durMin = max(30, (int) ($route['duration_min'] ?: 240));
    $arrivesUtc = gmdate('Y-m-d H:i:s', strtotime($departsUtc . ' UTC') + $durMin * 60);

    $tripId = transaction(function () use ($s, $route, $bus, $driverId, $departsUtc, $arrivesUtc, $price, $vipPrice) {
        q('INSERT INTO trips (agency_id, route_id, bus_id, departs_at, arrives_at, price, vip_price) VALUES (?,?,?,?,?,?,?)',
            [$s['agency_id'], $route['id'], $bus['id'], $departsUtc, $arrivesUtc, $price, $vipPrice]);
        $tid = (int) db()->lastInsertId();
        if ($driverId) {
            $drv = one('SELECT id FROM drivers WHERE id = ? AND agency_id = ?', [$driverId, $s['agency_id']]);
            if ($drv) q('INSERT INTO trip_drivers (trip_id, driver_id, position, assigned_by) VALUES (?,?,1,?)', [$tid, $drv['id'], $s['id']]);
        }
        audit((int) $s['id'], $s['agency_id'], 'trip.create', 'trip', $tid);
        return $tid;
    });

    json_out(['id' => $tripId], 201);
});

// Reporter un voyage entier à un nouvel horaire + notifier automatiquement tous les passagers
route('POST', '/api/agency/trips/{id}/postpone', function (array $p) {
    $s = require_agency(['owner', 'manager', 'secretary']);
    $in = input();
    $newLocal = trim((string) ($in['new_departs_local'] ?? ''));
    $reason = str_in($in['reason'] ?? 'Ajustement opérationnel', 180);

    $trip = one('SELECT t.*, r.duration_min, oc.timezone FROM trips t
                 JOIN routes r ON r.id = t.route_id JOIN cities oc ON oc.id = r.origin_city_id
                 WHERE t.id = ? AND t.agency_id = ?', [(int) $p['id'], $s['agency_id']])
        ?? fail(404, 'not_found', 'Voyage introuvable.');
    if (!in_array($trip['status'], ['scheduled', 'boarding'], true)) {
        fail(409, 'bad_state', 'Seul un voyage non parti peut être reporté.');
    }

    $newUtc = local_to_utc($newLocal, $trip['timezone']);
    $durMin = max(30, (int) ($trip['duration_min'] ?: 240));
    $newArrUtc = gmdate('Y-m-d H:i:s', strtotime($newUtc . ' UTC') + $durMin * 60);
    $diffMin = (int) round((strtotime($newUtc . ' UTC') - strtotime($trip['departs_at'] . ' UTC')) / 60);

    transaction(function () use ($s, $trip, $newUtc, $newArrUtc, $diffMin, $reason) {
        q('UPDATE trips SET postponed_from = COALESCE(postponed_from, departs_at), departs_at = ?, arrives_at = ?, delay_minutes = ?
           WHERE id = ?', [$newUtc, $newArrUtc, max(0, $diffMin), $trip['id']]);
        q("INSERT INTO trip_status_updates (trip_id, user_id, kind, cause, delay_minutes, note)
           VALUES (?, ?, 'delay', 'other', ?, ?)",
            [$trip['id'], $s['id'], max(0, $diffMin), "Voyage reporté : $reason"]);

        $buyers = all("SELECT DISTINCT b.user_id FROM bookings b
                       JOIN tickets k ON k.booking_id = b.id
                       WHERE k.trip_id = ? AND k.status = 'valid' AND b.user_id IS NOT NULL", [$trip['id']]);
        foreach ($buyers as $b) {
            notify_user((int) $b['user_id'], 'trip_postponed', [
                'trip_id' => (int) $trip['id'], 'new_departs_at' => iso($newUtc), 'reason' => $reason,
            ]);
        }
        audit((int) $s['id'], $s['agency_id'], 'trip.postpone', 'trip', (int) $trip['id'], ['new_utc' => $newUtc, 'reason' => $reason]);
    });

    json_out(['ok' => true, 'departs_at' => iso($newUtc)]);
});

// Changer l'état d'un départ (embarquement, parti, arrivé, annulé)
route('POST', '/api/agency/trips/{id}/status', function (array $p) {
    $s = require_agency(['owner', 'manager', 'secretary']);
    $status = (string) (input()['status'] ?? '');
    if (!in_array($status, ['boarding', 'departed', 'completed', 'cancelled'], true)) fail(422, 'invalid_status', 'Statut invalide.');

    $trip = one('SELECT id, status FROM trips WHERE id = ? AND agency_id = ?', [(int) $p['id'], $s['agency_id']])
        ?? fail(404, 'not_found', 'Départ introuvable.');

    $commission = null;
    if ($status === 'departed') {
        q("UPDATE trips SET status = 'departed', actual_departed_at = COALESCE(actual_departed_at, UTC_TIMESTAMP()) WHERE id = ?", [$trip['id']]);
        q("INSERT INTO trip_status_updates (trip_id, user_id, kind, progress_pct, note) VALUES (?, ?, 'departed', 0, 'Départ confirmé par la gare')",
            [$trip['id'], $s['id']]);
        $commission = settle_trip_commission((int) $trip['id'], 'departed');
    } elseif ($status === 'completed') {
        q("UPDATE trips SET status = 'completed', actual_arrived_at = UTC_TIMESTAMP() WHERE id = ?", [$trip['id']]);
        q("INSERT INTO trip_status_updates (trip_id, user_id, kind, speed_kmh, progress_pct, note) VALUES (?, ?, 'arrived', 0, 100, 'Arrivée confirmée')",
            [$trip['id'], $s['id']]);
        $commission = settle_trip_commission((int) $trip['id'], 'completed');
    } else {
        q('UPDATE trips SET status = ? WHERE id = ?', [$status, $trip['id']]);
    }
    audit((int) $s['id'], $s['agency_id'], 'trip.' . $status, 'trip', (int) $trip['id']);
    json_out(['ok' => true, 'commission' => $commission]);
});

// =============================================================================
// ESPACE DÉDIÉ CHAUFFEUR : mes bus/départs, disponibilité, ressenti, évolution temps réel
// =============================================================================
route('GET', '/api/agency/driver/me', function () {
    $s = require_agency(['driver', 'owner', 'manager']);
    $drv = one('SELECT * FROM drivers WHERE agency_id = ? AND user_id = ?', [$s['agency_id'], $s['id']]);
    if (!$drv && $s['role'] === 'driver') {
        q('INSERT INTO drivers (agency_id, user_id, photo_consent, licence_verified) VALUES (?,?,1,1)', [$s['agency_id'], $s['id']]);
        $drv = one('SELECT * FROM drivers WHERE agency_id = ? AND user_id = ?', [$s['agency_id'], $s['id']]);
    }

    $trips = [];
    if ($drv) {
        $trips = all("SELECT t.id, t.departs_at, t.arrives_at, t.actual_departed_at, t.actual_arrived_at, t.status, t.delay_minutes,
                             oc.name AS origin, dc.name AS destination, oc.timezone, r.distance_km,
                             oc.lat AS origin_lat, oc.lng AS origin_lng, dc.lat AS dest_lat, dc.lng AS dest_lng,
                             b.label AS bus_label, b.plate, b.seat_count, b.has_gps, b.gps_device_id,
                             (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status IN ('valid','boarded')) AS passengers_count
                      FROM trip_drivers td
                      JOIN trips t ON t.id = td.trip_id
                      JOIN routes r ON r.id = t.route_id
                      JOIN cities oc ON oc.id = r.origin_city_id
                      JOIN cities dc ON dc.id = r.dest_city_id
                      JOIN buses b ON b.id = t.bus_id
                      WHERE td.driver_id = ? AND t.agency_id = ? AND t.status <> 'cancelled'
                      ORDER BY FIELD(t.status, 'departed','boarding','scheduled','completed'), t.departs_at ASC
                      LIMIT 30", [$drv['id'], $s['agency_id']]);
    } else {
        // Pour l'administrateur ou le responsable programmation qui consulte le poste chauffeur
        $trips = all("SELECT t.id, t.departs_at, t.arrives_at, t.actual_departed_at, t.actual_arrived_at, t.status, t.delay_minutes,
                             oc.name AS origin, dc.name AS destination, oc.timezone, r.distance_km,
                             oc.lat AS origin_lat, oc.lng AS origin_lng, dc.lat AS dest_lat, dc.lng AS dest_lng,
                             b.label AS bus_label, b.plate, b.seat_count, b.has_gps, b.gps_device_id,
                             (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status IN ('valid','boarded')) AS passengers_count
                      FROM trips t
                      JOIN routes r ON r.id = t.route_id
                      JOIN cities oc ON oc.id = r.origin_city_id
                      JOIN cities dc ON dc.id = r.dest_city_id
                      JOIN buses b ON b.id = t.bus_id
                      WHERE t.agency_id = ? AND t.status <> 'cancelled'
                      ORDER BY FIELD(t.status, 'departed','boarding','scheduled','completed'), t.departs_at ASC
                      LIMIT 30", [$s['agency_id']]);
    }

    foreach ($trips as &$t) {
        $t['id'] = (int) $t['id'];
        $t['has_gps'] = (bool) ($t['has_gps'] ?? false);
        $t['origin_lat'] = $t['origin_lat'] !== null ? (float) $t['origin_lat'] : null;
        $t['origin_lng'] = $t['origin_lng'] !== null ? (float) $t['origin_lng'] : null;
        $t['dest_lat'] = $t['dest_lat'] !== null ? (float) $t['dest_lat'] : null;
        $t['dest_lng'] = $t['dest_lng'] !== null ? (float) $t['dest_lng'] : null;
        $t['departs_at'] = iso($t['departs_at']);
        $t['arrives_at'] = iso($t['arrives_at']);
        $t['actual_departed_at'] = iso($t['actual_departed_at']);
        $t['actual_arrived_at'] = iso($t['actual_arrived_at']);
        $updates = all('SELECT id, kind, cause, delay_minutes, lat, lng, speed_kmh, progress_pct, note, created_at
                        FROM trip_status_updates WHERE trip_id = ? ORDER BY id DESC LIMIT 12', [$t['id']]);
        foreach ($updates as &$u) {
            $u['lat'] = $u['lat'] !== null ? (float) $u['lat'] : null;
            $u['lng'] = $u['lng'] !== null ? (float) $u['lng'] : null;
            $u['speed_kmh'] = $u['speed_kmh'] !== null ? (int) $u['speed_kmh'] : null;
            $u['progress_pct'] = $u['progress_pct'] !== null ? (int) $u['progress_pct'] : null;
            $u['created_at'] = iso($u['created_at']);
        }
        $t['updates'] = $updates;
    }

    json_out([
        'driver' => $drv ? [
            'id' => (int) $drv['id'],
            'availability' => $drv['availability'],
            'mood' => $drv['mood'] !== null ? (int) $drv['mood'] : 5,
            'mood_note' => $drv['mood_note'],
            'photo_consent' => (bool) $drv['photo_consent'],
        ] : null,
        'trips' => $trips,
        'maps_config' => [
            'provider' => env('MAPS_PROVIDER', 'none'),
            'google_maps_api_key' => env('GOOGLE_MAPS_API_KEY', ''),
            'mapbox_access_token' => env('MAPBOX_ACCESS_TOKEN', ''),
        ],
    ]);
});

route('POST', '/api/agency/driver/profile', function () {
    $s = require_agency(['driver', 'owner']);
    $in = input();
    $avail = in_array($in['availability'] ?? '', ['available', 'on_trip', 'resting', 'unavailable', 'maintenance'], true)
        ? $in['availability'] : 'available';
    $mood = isset($in['mood']) ? max(1, min(5, (int) $in['mood'])) : null;
    $moodNote = str_in($in['mood_note'] ?? '', 255) ?: null;
    $consent = !empty($in['photo_consent']) ? 1 : 0;

    q('UPDATE drivers SET availability = ?, mood = ?, mood_note = ?, photo_consent = ?
       WHERE agency_id = ? AND user_id = ?',
        [$avail, $mood, $moodNote, $consent, $s['agency_id'], $s['id']]);
    json_out(['ok' => true]);
});

// Signalement par le chauffeur : départ, vitesse km/h + progression %, coordonnées GPS, retard/arrêt prolongé/déviation, reprise, arrivée
route('POST', '/api/agency/driver/trips/{id}/report', function (array $p) {
    $s = require_agency(['driver', 'owner', 'manager']);
    $trip = one('SELECT id, status, delay_minutes FROM trips WHERE id = ? AND agency_id = ?', [(int) $p['id'], $s['agency_id']])
        ?? fail(404, 'not_found', 'Trajet introuvable.');

    if ($s['role'] === 'driver') {
        $assigned = one('SELECT 1 FROM trip_drivers td JOIN drivers d ON d.id = td.driver_id
                         WHERE td.trip_id = ? AND d.user_id = ?', [$trip['id'], $s['id']]);
        if (!$assigned) fail(403, 'not_assigned', 'Ce trajet ne vous est pas attribué.');
    }

    $in = input();
    $kind = in_array($in['kind'] ?? '', ['departed', 'position', 'delay', 'prolonged_stop', 'deviation', 'breakdown', 'resumed', 'arrived', 'info'], true)
        ? $in['kind'] : 'position';
    $cause = in_array($in['cause'] ?? '', ['traffic', 'breakdown', 'prolonged_stop', 'deviation', 'accident', 'weather', 'police', 'fuel', 'passenger', 'other'], true)
        ? $in['cause'] : null;
    $delayMin = isset($in['delay_minutes']) && $in['delay_minutes'] !== '' ? max(0, min(600, (int) $in['delay_minutes'])) : null;
    $speed = isset($in['speed_kmh']) && $in['speed_kmh'] !== '' ? max(0, min(160, (int) $in['speed_kmh'])) : null;
    $progress = isset($in['progress_pct']) && $in['progress_pct'] !== '' ? max(0, min(100, (int) $in['progress_pct'])) : null;
    $lat = isset($in['lat']) && $in['lat'] !== '' && $in['lat'] !== null ? (float) $in['lat'] : null;
    $lng = isset($in['lng']) && $in['lng'] !== '' && $in['lng'] !== null ? (float) $in['lng'] : null;
    $note = str_in($in['note'] ?? '', 255) ?: null;

    $commission = transaction(function () use ($s, $trip, $kind, $cause, $delayMin, $lat, $lng, $speed, $progress, $note) {
        $comm = null;
        if ($kind === 'departed') {
            q("UPDATE trips SET status = 'departed', actual_departed_at = COALESCE(actual_departed_at, UTC_TIMESTAMP()) WHERE id = ?", [$trip['id']]);
            q("UPDATE drivers SET availability = 'on_trip' WHERE agency_id = ? AND user_id = ?", [$s['agency_id'], $s['id']]);
            $comm = settle_trip_commission((int) $trip['id'], 'departed');
        } elseif ($kind === 'arrived') {
            q("UPDATE trips SET status = 'completed', actual_arrived_at = UTC_TIMESTAMP() WHERE id = ?", [$trip['id']]);
            q("UPDATE drivers SET availability = 'available' WHERE agency_id = ? AND user_id = ?", [$s['agency_id'], $s['id']]);
            $comm = settle_trip_commission((int) $trip['id'], 'completed');
        } elseif (in_array($kind, ['delay', 'prolonged_stop', 'deviation', 'breakdown'], true) && $delayMin !== null) {
            q("UPDATE trips SET status = IF(status = 'scheduled', 'departed', status), delay_minutes = delay_minutes + ? WHERE id = ?",
                [$delayMin, $trip['id']]);
            $comm = settle_trip_commission((int) $trip['id'], 'departed');
        }

        if ($lat !== null && $lng !== null) {
            q("UPDATE trips SET current_lat = ?, current_lng = ?, current_speed_kmh = ?, current_progress_pct = ?, last_gps_at = UTC_TIMESTAMP() WHERE id = ?",
                [$lat, $lng, $speed, $progress, $trip['id']]);
        }

        q('INSERT INTO trip_status_updates (trip_id, user_id, kind, cause, delay_minutes, lat, lng, speed_kmh, progress_pct, note)
           VALUES (?,?,?,?,?,?,?,?,?,?)',
            [$trip['id'], $s['id'], $kind, $cause, $delayMin, $lat, $lng, $speed, $progress, $note]);
        audit((int) $s['id'], $s['agency_id'], 'driver.report_' . $kind, 'trip', (int) $trip['id']);
        return $comm;
    });

    json_out(['ok' => true, 'commission' => $commission]);
});

// Ping GPS continu haute fréquence du chauffeur depuis son smartphone
route('POST', '/api/agency/driver/trips/{id}/live-ping', function (array $p) {
    $s = require_agency(['driver', 'owner', 'manager']);
    $trip = one('SELECT id, status FROM trips WHERE id = ? AND agency_id = ?', [(int) $p['id'], $s['agency_id']])
        ?? fail(404, 'not_found', 'Trajet introuvable.');

    $in = input();
    $lat = isset($in['lat']) && $in['lat'] !== '' ? (float) $in['lat'] : null;
    $lng = isset($in['lng']) && $in['lng'] !== '' ? (float) $in['lng'] : null;
    $speed = isset($in['speed_kmh']) ? max(0, min(160, (int) $in['speed_kmh'])) : null;
    $progress = isset($in['progress_pct']) ? max(0, min(100, (int) $in['progress_pct'])) : null;

    if ($lat !== null && $lng !== null) {
        q("UPDATE trips SET current_lat = ?, current_lng = ?, current_speed_kmh = ?, current_progress_pct = ?, last_gps_at = UTC_TIMESTAMP(), status = IF(status = 'scheduled' OR status = 'boarding', 'departed', status) WHERE id = ?",
            [$lat, $lng, $speed, $progress, $trip['id']]);
        q("UPDATE drivers SET availability = 'on_trip' WHERE agency_id = ? AND user_id = ?", [$s['agency_id'], $s['id']]);
    }

    json_out(['ok' => true, 'lat' => $lat, 'lng' => $lng, 'speed_kmh' => $speed]);
});

// Vision d'ensemble de la flotte en temps réel (GPS, vitesse, progression, retards, chauffeur)
route('GET', '/api/agency/fleet-live', function () {
    $s = require_agency(['owner', 'manager', 'secretary', 'accountant', 'staff']);
    $trips = all("SELECT t.id, t.status, t.departs_at, t.arrives_at, t.delay_minutes,
                         t.current_lat, t.current_lng, t.current_speed_kmh, t.current_progress_pct, t.last_gps_at,
                         oc.name AS origin, dc.name AS destination, r.distance_km,
                         b.label AS bus_label, b.plate, b.seat_count, b.has_gps,
                         (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status IN ('valid','boarded')) AS booked_seats,
                         (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status = 'boarded') AS boarded_seats,
                         (SELECT CONCAT(u.first_name, ' ', u.last_name) FROM trip_drivers td JOIN drivers d ON d.id = td.driver_id JOIN users u ON u.id = d.user_id WHERE td.trip_id = t.id LIMIT 1) AS driver_name,
                         (SELECT u.phone FROM trip_drivers td JOIN drivers d ON d.id = td.driver_id JOIN users u ON u.id = d.user_id WHERE td.trip_id = t.id LIMIT 1) AS driver_phone
                  FROM trips t
                  JOIN routes r ON r.id = t.route_id
                  JOIN cities oc ON oc.id = r.origin_city_id
                  JOIN cities dc ON dc.id = r.dest_city_id
                  JOIN buses b ON b.id = t.bus_id
                  WHERE t.agency_id = ? AND t.status IN ('scheduled', 'boarding', 'departed')
                  ORDER BY t.departs_at ASC", [$s['agency_id']]);

    foreach ($trips as &$tr) {
        $tr['booked_seats'] = (int) $tr['booked_seats'];
        $tr['boarded_seats'] = (int) $tr['boarded_seats'];
        $tr['seat_count'] = (int) $tr['seat_count'];
        $tr['is_full'] = $tr['booked_seats'] >= $tr['seat_count'];
        $tr['departs_at'] = iso($tr['departs_at']);
        $tr['arrives_at'] = iso($tr['arrives_at']);
        $tr['last_gps_at'] = iso($tr['last_gps_at']);
    }
    json_out($trips);
});

// Mise à jour de la photo de profil (WhatsApp style) pour n'importe quel membre du personnel
route('POST', '/api/agency/me/avatar', function () {
    $s = require_agency();
    $in = input();
    $avatarUrl = str_in($in['avatar_url'] ?? '', 1000000) ?: null;

    q("UPDATE agency_staff SET avatar_url = ? WHERE agency_id = ? AND user_id = ?",
        [$avatarUrl, $s['agency_id'], $s['id']]);
    q("UPDATE users SET avatar_url = ? WHERE id = ?", [$avatarUrl, $s['id']]);

    json_out(['ok' => true, 'avatar_url' => $avatarUrl]);
});

// Diagramme & Statistiques de ventes par période (Journalière, Hebdomadaire, Mensuelle, Annuelle)
route('GET', '/api/agency/sales-analytics', function () {
    $s = require_agency(['owner', 'manager', 'secretary', 'accountant']);
    $period = strtolower(trim((string) ($_GET['period'] ?? 'weekly')));
    if (!in_array($period, ['daily', 'weekly', 'monthly', 'yearly'], true)) {
        $period = 'weekly';
    }

    $agencyId = (int) $s['agency_id'];
    $cur = one("SELECT currency_code FROM agencies WHERE id = ?", [$agencyId])['currency_code'] ?? 'XAF';

    // Agrégation selon la période choisie
    $dataPoints = [];
    if ($period === 'daily') {
        // 24 heures de la journée en cours
        $sql = "SELECT HOUR(p.created_at) AS hr,
                       COALESCE(SUM(p.amount), 0) AS total_gross,
                       COALESCE(SUM(p.agency_net_amount), 0) AS total_net,
                       COALESCE(SUM(p.platform_fee_amount), 0) AS total_fee,
                       COUNT(p.id) AS tickets_count
                FROM payments p
                JOIN bookings b ON b.id = p.booking_id
                WHERE b.agency_id = ? AND p.status = 'succeeded' AND DATE(p.created_at) = CURDATE()
                GROUP BY HOUR(p.created_at)
                ORDER BY hr ASC";
        $rows = all($sql, [$agencyId]);
        $map = [];
        foreach ($rows as $r) $map[(int)$r['hr']] = $r;
        for ($h = 0; $h < 24; $h += 2) {
            $r = $map[$h] ?? null;
            $dataPoints[] = [
                'label' => sprintf('%02dh', $h),
                'gross' => (int) ($r['total_gross'] ?? 0),
                'net' => (int) ($r['total_net'] ?? 0),
                'commission' => (int) ($r['total_fee'] ?? 0),
                'tickets' => (int) ($r['tickets_count'] ?? 0),
            ];
        }
    } elseif ($period === 'weekly') {
        // 7 derniers jours
        $sql = "SELECT DATE(p.created_at) AS dt,
                       DAYNAME(p.created_at) AS day_name,
                       COALESCE(SUM(p.amount), 0) AS total_gross,
                       COALESCE(SUM(p.agency_net_amount), 0) AS total_net,
                       COALESCE(SUM(p.platform_fee_amount), 0) AS total_fee,
                       COUNT(p.id) AS tickets_count
                FROM payments p
                JOIN bookings b ON b.id = p.booking_id
                WHERE b.agency_id = ? AND p.status = 'succeeded' AND p.created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
                GROUP BY DATE(p.created_at)
                ORDER BY dt ASC";
        $rows = all($sql, [$agencyId]);
        $map = [];
        foreach ($rows as $r) $map[$r['dt']] = $r;
        $dayNamesFr = ['Mon'=>'Lun', 'Tue'=>'Mar', 'Wed'=>'Mer', 'Thu'=>'Jeu', 'Fri'=>'Ven', 'Sat'=>'Sam', 'Sun'=>'Dim'];
        for ($i = 6; $i >= 0; $i--) {
            $dt = date('Y-m-d', strtotime("-$i days"));
            $dShort = date('D', strtotime($dt));
            $r = $map[$dt] ?? null;
            $dataPoints[] = [
                'label' => ($dayNamesFr[$dShort] ?? $dShort) . ' ' . date('d/m', strtotime($dt)),
                'date' => $dt,
                'gross' => (int) ($r['total_gross'] ?? 0),
                'net' => (int) ($r['total_net'] ?? 0),
                'commission' => (int) ($r['total_fee'] ?? 0),
                'tickets' => (int) ($r['tickets_count'] ?? 0),
            ];
        }
    } elseif ($period === 'monthly') {
        // 4 semaines du mois
        $sql = "SELECT WEEK(p.created_at, 1) AS wk,
                       MIN(DATE(p.created_at)) AS start_dt,
                       COALESCE(SUM(p.amount), 0) AS total_gross,
                       COALESCE(SUM(p.agency_net_amount), 0) AS total_net,
                       COALESCE(SUM(p.platform_fee_amount), 0) AS total_fee,
                       COUNT(p.id) AS tickets_count
                FROM payments p
                JOIN bookings b ON b.id = p.booking_id
                WHERE b.agency_id = ? AND p.status = 'succeeded' AND p.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                GROUP BY WEEK(p.created_at, 1)
                ORDER BY wk ASC";
        $rows = all($sql, [$agencyId]);
        foreach ($rows as $idx => $r) {
            $dataPoints[] = [
                'label' => 'Sem. ' . ($idx + 1) . ' (' . date('d/m', strtotime((string)$r['start_dt'])) . ')',
                'gross' => (int) $r['total_gross'],
                'net' => (int) $r['total_net'],
                'commission' => (int) $r['total_fee'],
                'tickets' => (int) $r['tickets_count'],
            ];
        }
        if (empty($dataPoints)) {
            for ($w = 1; $w <= 4; $w++) {
                $dataPoints[] = ['label' => "Semaine $w", 'gross' => 0, 'net' => 0, 'commission' => 0, 'tickets' => 0];
            }
        }
    } else {
        // 12 mois de l'année
        $sql = "SELECT MONTH(p.created_at) AS m,
                       COALESCE(SUM(p.amount), 0) AS total_gross,
                       COALESCE(SUM(p.agency_net_amount), 0) AS total_net,
                       COALESCE(SUM(p.platform_fee_amount), 0) AS total_fee,
                       COUNT(p.id) AS tickets_count
                FROM payments p
                JOIN bookings b ON b.id = p.booking_id
                WHERE b.agency_id = ? AND p.status = 'succeeded' AND YEAR(p.created_at) = YEAR(CURDATE())
                GROUP BY MONTH(p.created_at)
                ORDER BY m ASC";
        $rows = all($sql, [$agencyId]);
        $map = [];
        foreach ($rows as $r) $map[(int)$r['m']] = $r;
        $monthsFr = [1=>'Jan',2=>'Fév',3=>'Mar',4=>'Avr',5=>'Mai',6=>'Juin',7=>'Juil',8=>'Aoû',9=>'Sep',10=>'Oct',11=>'Nov',12=>'Déc'];
        for ($m = 1; $m <= 12; $m++) {
            $r = $map[$m] ?? null;
            $dataPoints[] = [
                'label' => $monthsFr[$m],
                'gross' => (int) ($r['total_gross'] ?? 0),
                'net' => (int) ($r['total_net'] ?? 0),
                'commission' => (int) ($r['total_fee'] ?? 0),
                'tickets' => (int) ($r['tickets_count'] ?? 0),
            ];
        }
    }

    $totalGross = array_sum(array_column($dataPoints, 'gross'));
    $totalNet = array_sum(array_column($dataPoints, 'net'));
    $totalCommission = array_sum(array_column($dataPoints, 'commission'));
    $totalTickets = array_sum(array_column($dataPoints, 'tickets'));

    json_out([
        'period' => $period,
        'currency_code' => $cur,
        'data' => $dataPoints,
        'summary' => [
            'total_gross' => $totalGross,
            'total_net' => $totalNet,
            'total_commission' => $totalCommission,
            'total_tickets' => $totalTickets,
        ],
    ]);
});

// =============================================================================
// COMPTABILITÉ, LOCATION DE BUS, VENTE DE BUS & JOURNAL D'AUDIT
// =============================================================================
route('GET', '/api/agency/finance', function () {
    $s = require_agency(['owner', 'accountant']);
    $ag = one('SELECT payout_method, payout_account_number, payout_account_name, wallet_balance, currency_code, name, phone FROM agencies WHERE id = ?', [$s['agency_id']]);

    $payments = all("SELECT p.id, p.provider, p.provider_ref, p.payer_account, p.agency_payout_account,
                            p.amount, p.agency_net_amount, p.platform_fee_amount, p.currency_code, p.status, p.created_at,
                            b.reference, b.channel
                     FROM payments p JOIN bookings b ON b.id = p.booking_id
                     WHERE b.agency_id = ? ORDER BY p.id DESC LIMIT 40", [$s['agency_id']]);
    foreach ($payments as &$pm) $pm['created_at'] = iso($pm['created_at']);

    $refunds = all("SELECT rf.id, rf.amount, rf.reason, rf.status, rf.requested_at, b.reference, k.passenger_name
                    FROM refunds rf
                    JOIN tickets k ON k.id = rf.ticket_id
                    JOIN bookings b ON b.id = k.booking_id
                    WHERE b.agency_id = ? ORDER BY rf.id DESC LIMIT 30", [$s['agency_id']]);
    foreach ($refunds as &$rf) $rf['requested_at'] = iso($rf['requested_at']);

    $totals = one("SELECT COALESCE(SUM(CASE WHEN p.status = 'succeeded' THEN p.amount ELSE 0 END), 0) AS gross,
                          (SELECT COALESCE(SUM(rf2.amount), 0) FROM refunds rf2
                           JOIN tickets k2 ON k2.id = rf2.ticket_id JOIN bookings b2 ON b2.id = k2.booking_id
                           WHERE b2.agency_id = ? AND rf2.status IN ('approved','paid')) AS refunded,
                          (SELECT COALESCE(SUM(pc.commission_amount), 0) FROM platform_commissions pc
                           WHERE pc.agency_id = ?) AS veltron_commission
                   FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE b.agency_id = ?",
        [$s['agency_id'], $s['agency_id'], $s['agency_id']]);

    $commissions = all("SELECT pc.id, pc.trip_id, pc.seats_filled, pc.seat_capacity, pc.is_full_bus,
                               pc.gross_amount, pc.rate_bps, pc.commission_amount, pc.currency_code,
                               pc.trigger_event, pc.settled_at,
                               oc.name AS origin, dc.name AS destination, t.departs_at
                        FROM platform_commissions pc
                        JOIN trips t ON t.id = pc.trip_id
                        JOIN routes r ON r.id = t.route_id
                        JOIN cities oc ON oc.id = r.origin_city_id
                        JOIN cities dc ON dc.id = r.dest_city_id
                        WHERE pc.agency_id = ?
                        ORDER BY pc.settled_at DESC LIMIT 30", [$s['agency_id']]);
    foreach ($commissions as &$cm) {
        $cm['is_full_bus'] = (bool) $cm['is_full_bus'];
        $cm['settled_at'] = iso($cm['settled_at']);
        $cm['departs_at'] = iso($cm['departs_at']);
    }

    $gross = (int) ($totals['gross'] ?? 0);
    $refunded = (int) ($totals['refunded'] ?? 0);
    $veltronComm = (int) ($totals['veltron_commission'] ?? 0);

    json_out([
        'gross' => $gross,
        'refunded' => $refunded,
        'veltron_commission' => $veltronComm,
        'commission_rate_bps' => 50,
        'net' => max(0, $gross - $refunded - $veltronComm),
        'wallet_balance' => (int) ($ag['wallet_balance'] ?? 0),
        'payout_settings' => [
            'payout_method' => $ag['payout_method'] ?: 'orange_money',
            'payout_account_number' => $ag['payout_account_number'] ?: ($ag['phone'] ?? ''),
            'payout_account_name' => $ag['payout_account_name'] ?: ($ag['name'] ?? ''),
        ],
        'payments' => $payments,
        'refunds' => $refunds,
        'commissions' => $commissions,
    ]);
});

route('POST', '/api/agency/payout-settings', function () {
    $s = require_agency(['owner', 'accountant']);
    $in = input();
    $pm = strtolower(trim((string) ($in['payout_method'] ?? 'orange_money')));
    if (!in_array($pm, ['orange_money', 'mtn_momo', 'wave', 'bank_transfer', 'card'], true)) $pm = 'orange_money';
    $accNum = str_in($in['payout_account_number'] ?? '', 80);
    $accName = str_in($in['payout_account_name'] ?? '', 120);
    if ($accNum === '') fail(422, 'missing_account', 'Veuillez renseigner le numéro ou IBAN du compte de réception de l\'agence.');

    q('UPDATE agencies SET payout_method = ?, payout_account_number = ?, payout_account_name = ? WHERE id = ?',
        [$pm, $accNum, $accName ?: null, $s['agency_id']]);
    audit((int) $s['id'], $s['agency_id'], 'agency.payout_settings', 'agency', $s['agency_id'], ['method' => $pm]);
    json_out(['ok' => true]);
});

route('GET', '/api/agency/rentals', function () {
    $s = require_agency(['owner', 'manager', 'secretary', 'accountant']);
    $ag = one('SELECT country_id FROM agencies WHERE id = ?', [$s['agency_id']]);
    $rows = all("SELECT id, reference, departure, destination, start_date, end_date, passengers, bus_type,
                        with_driver, contact_name, contact_email, contact_phone, notes, status, quote_amount, agency_reply, created_at
                 FROM rental_requests
                 WHERE agency_id = ? OR (agency_id IS NULL AND country_id = ?)
                 ORDER BY id DESC LIMIT 40", [$s['agency_id'], $ag['country_id']]);
    foreach ($rows as &$r) $r['created_at'] = iso($r['created_at']);
    json_out($rows);
});

route('POST', '/api/agency/rentals/{id}/quote', function (array $p) {
    $s = require_agency(['owner', 'manager', 'secretary', 'accountant']);
    $in = input();
    $amount = max(1, (int) ($in['quote_amount'] ?? 0));
    $reply = str_in($in['agency_reply'] ?? '', 800);

    q("UPDATE rental_requests SET status = 'quoted', quote_amount = ?, agency_reply = ?, answered_by_agency = ?
       WHERE id = ?", [$amount, $reply, $s['agency_id'], (int) $p['id']]);
    json_out(['ok' => true]);
});

route('GET', '/api/agency/bus-listings', function () {
    $s = require_agency(['owner', 'manager']);
    $listings = all('SELECT * FROM bus_listings WHERE agency_id = ? ORDER BY id DESC', [$s['agency_id']]);
    $inquiries = all("SELECT bi.*, bl.title AS listing_title FROM bus_inquiries bi
                      JOIN bus_listings bl ON bl.id = bi.listing_id
                      WHERE bl.agency_id = ? ORDER BY bi.id DESC LIMIT 30", [$s['agency_id']]);
    json_out(['listings' => $listings, 'inquiries' => $inquiries]);
});

route('POST', '/api/agency/bus-listings', function () {
    $s = require_agency(['owner', 'manager']);
    $in = input();
    $ag = one('SELECT currency_code FROM agencies WHERE id = ?', [$s['agency_id']]);
    $title = str_in($in['title'] ?? '', 120);
    $brand = str_in($in['brand'] ?? '', 60);
    $year = max(1995, min(2030, (int) ($in['year'] ?? 2020)));
    $seats = max(8, min(90, (int) ($in['seats'] ?? 50)));
    $price = max(1, (int) ($in['price'] ?? 0));
    if ($title === '' || $brand === '') fail(422, 'invalid_fields', 'Titre et marque obligatoires.');

    q('INSERT INTO bus_listings (agency_id, title, brand, model, year, seats, mileage_km, price, currency_code, description, photo_path)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [$s['agency_id'], $title, $brand, str_in($in['model'] ?? '', 60) ?: null, $year, $seats,
         !empty($in['mileage_km']) ? (int) $in['mileage_km'] : null, $price, $ag['currency_code'],
         str_in($in['description'] ?? '', 1000) ?: null, '/media/bus.jpeg']);
    json_out(['id' => (int) db()->lastInsertId()], 201);
});

route('GET', '/api/agency/audit', function () {
    $s = require_agency(['owner']);
    $rows = all("SELECT a.id, a.action, a.entity, a.entity_id, a.ip, a.meta, a.created_at,
                        u.first_name, u.last_name, u.email
                 FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
                 WHERE a.agency_id = ? ORDER BY a.id DESC LIMIT 60", [$s['agency_id']]);
    foreach ($rows as &$r) {
        $r['created_at'] = iso($r['created_at']);
        $r['meta'] = $r['meta'] ? json_decode($r['meta'], true) : null;
    }
    json_out($rows);
});

// =============================================================================
// GESTION DU PERSONNEL : DEMANDES D'ADHÉSION, FRAUDE & TABLEAU MODULAIRE
// =============================================================================

// Liste des demandes d'adhésion au sein de l'agence (pending, approved, rejected, reported)
route('GET', '/api/agency/join-requests', function () {
    $s = require_agency(['owner', 'manager']);
    $rows = all("SELECT jr.id, jr.agency_id, jr.first_name, jr.last_name, jr.email, jr.phone,
                        jr.requested_role, jr.custom_role_title, jr.modules_json, jr.status,
                        jr.matricule_generated, jr.ip, jr.user_agent, jr.reported_reason,
                        jr.reported_evidence_json, jr.decided_at, jr.created_at,
                        du.first_name AS decider_first_name, du.last_name AS decider_last_name
                 FROM staff_join_requests jr
                 LEFT JOIN users du ON du.id = jr.decided_by
                 WHERE jr.agency_id = ?
                 ORDER BY FIELD(jr.status, 'pending', 'reported', 'approved', 'rejected'), jr.id DESC LIMIT 100",
        [$s['agency_id']]);

    foreach ($rows as &$r) {
        $r['modules'] = $r['modules_json'] ? json_decode($r['modules_json'], true) : [];
        $r['reported_evidence'] = $r['reported_evidence_json'] ? json_decode($r['reported_evidence_json'], true) : null;
        $r['created_at'] = iso($r['created_at']);
        $r['decided_at'] = $r['decided_at'] ? iso($r['decided_at']) : null;
        unset($r['modules_json'], $r['reported_evidence_json']);
    }
    json_out($rows);
});

// Action sur une demande d'adhésion : approve, reject, report
route('POST', '/api/agency/join-requests/{id}/action', function (array $p) {
    $s = require_agency(['owner', 'manager']);
    $in = input();
    $action = (string) ($in['action'] ?? '');
    $reqId = (int) $p['id'];

    $req = one("SELECT * FROM staff_join_requests WHERE id = ? AND agency_id = ?", [$reqId, $s['agency_id']])
        ?? fail(404, 'not_found', 'Demande d\'adhésion introuvable.');

    if ($action === 'approve') {
        if ($req['status'] === 'approved') fail(409, 'already_approved', 'Cette demande a déjà été validée.');

        $matricule = transaction(function () use ($s, $req) {
            // 1. Vérifier si l'utilisateur existe déjà ou le créer
            $user = one("SELECT id FROM users WHERE email = ?", [$req['email']]);
            if (!$user) {
                $algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
                $pwHash = $req['password_hash'] ?: password_hash('PassTemp123!', $algo);
                q("INSERT INTO users (email, phone, password_hash, first_name, last_name, status) VALUES (?, ?, ?, ?, ?, 'active')",
                    [$req['email'], $req['phone'] ?: null, $pwHash, $req['first_name'], $req['last_name']]);
                $userId = (int) db()->lastInsertId();
            } else {
                $userId = (int) $user['id'];
            }

            // 2. Déterminer le rôle officiel
            $validRoles = ['manager', 'secretary', 'driver', 'staff', 'accountant'];
            $role = in_array($req['requested_role'], $validRoles, true) ? $req['requested_role'] : 'staff';
            $customTitle = $req['custom_role_title'] ?: ($req['requested_role'] === 'other' ? 'Poste personnalisé' : $role);

            // 3. Génération automatique du matricule unique
            $prefix = match ($role) {
                'secretary'  => 'SEC',
                'driver'     => 'CHAUF',
                'manager'    => 'PRG',
                'accountant' => 'CPT',
                default      => 'STF',
            };
            $countStaff = (int) (one("SELECT COUNT(*) AS c FROM agency_staff WHERE agency_id = ? AND role = ?", [$s['agency_id'], $role])['c'] ?? 0) + 1;
            $matricule = sprintf('AG%d-%s-%02d', (int) $s['agency_id'], $prefix, $countStaff);

            // 4. Modules autorisés pour son tableau de bord
            $modulesJson = $req['modules_json'] ?: json_encode(['desk', 'boarding', 'tracking']);

            // 5. Insérer ou activer dans agency_staff
            $existingStaff = one("SELECT id FROM agency_staff WHERE agency_id = ? AND user_id = ?", [$s['agency_id'], $userId]);
            if ($existingStaff) {
                q("UPDATE agency_staff SET role = ?, job_title = ?, custom_role = ?, matricule = ?, dashboard_modules = ?, status = 'active', resigned_at = NULL WHERE id = ?",
                    [$role, $customTitle, $customTitle, $matricule, $modulesJson, $existingStaff['id']]);
            } else {
                q("INSERT INTO agency_staff (agency_id, user_id, role, job_title, custom_role, matricule, dashboard_modules, status, invited_by)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)",
                    [$s['agency_id'], $userId, $role, $customTitle, $customTitle, $matricule, $modulesJson, $s['id']]);
            }

            // 6. Si chauffeur, insérer dans drivers
            if ($role === 'driver') {
                q("INSERT IGNORE INTO drivers (agency_id, user_id, photo_consent, licence_verified) VALUES (?, ?, 1, 1)",
                    [$s['agency_id'], $userId]);
            }

            // 7. Mettre à jour la demande
            q("UPDATE staff_join_requests SET status = 'approved', matricule_generated = ?, decided_by = ?, decided_at = UTC_TIMESTAMP() WHERE id = ?",
                [$matricule, $s['id'], $req['id']]);

            audit((int) $s['id'], $s['agency_id'], 'staff.approved_join', 'staff_join_request', $req['id'], [
                'matricule' => $matricule,
                'email' => $req['email'],
                'role' => $role,
            ]);

            return $matricule;
        });

        json_out([
            'ok' => true,
            'action' => 'approved',
            'matricule' => $matricule,
            'message' => "La demande de {$req['first_name']} {$req['last_name']} a été validée. Son matricule officiel est {$matricule}."
        ]);

    } elseif ($action === 'reject') {
        q("UPDATE staff_join_requests SET status = 'rejected', decided_by = ?, decided_at = UTC_TIMESTAMP() WHERE id = ?",
            [$s['id'], $req['id']]);

        audit((int) $s['id'], $s['agency_id'], 'staff.reject_join', 'staff_join_request', $req['id']);

        json_out(['ok' => true, 'action' => 'rejected']);

    } elseif ($action === 'report') {
        $reason = str_in($in['reason'] ?? 'Tentative d\'usurpation d\'identité / intrusion illégitime', 300);
        $agency = one("SELECT name, slug, phone FROM agencies WHERE id = ?", [$s['agency_id']]);

        // Préparation du dossier de preuve pour plainte
        $evidence = [
            'pv_reference' => sprintf('PV-FRAUD-AG%d-%05d', (int) $s['agency_id'], (int) $req['id']),
            'incident_type' => 'Tentative d\'usurpation d\'identité et d\'accès illégal au système d\'agence',
            'reported_at' => gmdate('Y-m-d H:i:s') . ' UTC',
            'suspect' => [
                'full_name' => trim($req['first_name'] . ' ' . $req['last_name']),
                'email' => $req['email'],
                'phone' => $req['phone'] ?: 'Non communiqué',
                'ip_address' => $req['ip'] ?: '127.0.0.1',
                'user_agent' => $req['user_agent'] ?: 'Inconnu',
                'attempted_role' => $req['requested_role'],
                'custom_title' => $req['custom_role_title'],
                'timestamp' => $req['created_at'],
            ],
            'agency' => [
                'agency_id' => (int) $s['agency_id'],
                'agency_name' => $agency['name'] ?? 'VELTRON Partner Agency',
                'reported_by_officer' => trim($s['first_name'] . ' ' . $s['last_name']) . " (Admin / Responsable)",
            ],
            'legal_notice' => 'Infraction passible de sanctions selon les dispositions relatives à la cybercriminalité, fraude informatique et faux en écritures.',
            'justification' => $reason,
        ];

        q("UPDATE staff_join_requests SET status = 'reported', reported_reason = ?, reported_evidence_json = ?, decided_by = ?, decided_at = UTC_TIMESTAMP() WHERE id = ?",
            [$reason, json_encode($evidence), $s['id'], $req['id']]);

        audit((int) $s['id'], $s['agency_id'], 'staff.report_fraud', 'staff_join_request', $req['id'], [
            'reason' => $reason,
            'suspect_email' => $req['email'],
        ]);

        json_out([
            'ok' => true,
            'action' => 'reported',
            'complaint_file' => $evidence,
            'message' => "Le signalement pour fraude a été enregistré. Le dossier juridique et les données techniques du suspect sont disponibles pour déposer plainte."
        ]);
    } else {
        fail(422, 'invalid_action', 'Action non reconnue (approve, reject, report).');
    }
});

// Consultation et mise à jour des modules du tableau de bord d'un collaborateur
route('GET', '/api/agency/me/dashboard-modules', function () {
    $s = require_agency();
    $row = one("SELECT dashboard_modules, role, custom_role, matricule FROM agency_staff WHERE agency_id = ? AND user_id = ?",
        [$s['agency_id'], $s['id']]);

    $saved = $row && $row['dashboard_modules'] ? json_decode($row['dashboard_modules'], true) : null;
    if (!$saved) {
        $saved = match ($s['role']) {
            'owner', 'manager' => ['desk', 'boarding', 'fleet', 'tracking', 'rentals', 'sales', 'analytics', 'settings'],
            'secretary'        => ['desk', 'cash_journal', 'fleet'],
            'driver'           => ['tracking', 'trips'],
            'accountant'       => ['sales', 'analytics', 'cash_journal'],
            default            => ['desk', 'boarding', 'tracking'],
        };
    }

    json_out([
        'role' => $s['role'],
        'matricule' => $row['matricule'] ?? null,
        'custom_role' => $row['custom_role'] ?? null,
        'modules' => $saved,
    ]);
});

route('POST', '/api/agency/me/dashboard-modules', function () {
    $s = require_agency();
    $in = input();
    $modules = $in['modules'] ?? [];
    if (!is_array($modules)) fail(422, 'invalid_modules', 'Liste des modules invalide.');

    $allowed = ['desk', 'boarding', 'fleet', 'tracking', 'rentals', 'sales', 'analytics', 'settings', 'cash_journal'];
    $filtered = array_values(array_intersect($allowed, $modules));

    q("UPDATE agency_staff SET dashboard_modules = ? WHERE agency_id = ? AND user_id = ?",
        [json_encode($filtered), $s['agency_id'], $s['id']]);

    json_out(['ok' => true, 'modules' => $filtered]);
});

// Départ du collaborateur (« Je ne suis plus employé de l'agence »)
route('POST', '/api/agency/me/resign', function () {
    $s = require_agency();
    if ($s['role'] === 'owner') {
        $ownersCount = (int) (one("SELECT COUNT(*) AS c FROM agency_staff WHERE agency_id = ? AND role = 'owner' AND status = 'active'", [$s['agency_id']])['c'] ?? 0);
        if ($ownersCount <= 1) {
            fail(409, 'last_owner', 'En tant qu\'unique administrateur propriétaire, vous ne pouvez pas démissionner sans déléguer l\'agence à un successeur.');
        }
    }

    q("UPDATE agency_staff SET status = 'disabled', resigned_at = UTC_TIMESTAMP() WHERE agency_id = ? AND user_id = ?",
        [$s['agency_id'], $s['id']]);

    // Révocation de toutes les sessions actives de ce membre pour cette agence
    q("UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE realm = 'agency' AND agency_id = ? AND user_id = ?",
        [$s['agency_id'], $s['id']]);

    audit((int) $s['id'], $s['agency_id'], 'staff.resigned', 'agency_staff', (int) $s['id']);

    json_out([
        'ok' => true,
        'message' => 'Votre départ a été enregistré. Vos accès ont été clôturés en toute sécurité.'
    ]);
});

// Délégation des fonctions d'un poste par l'administrateur
route('POST', '/api/agency/staff/{userId}/delegate', function (array $p) {
    $s = require_agency(['owner']);
    $in = input();
    $targetUid = (int) $p['userId'];
    $delegateToUid = (int) ($in['delegate_to_user_id'] ?? 0);

    if ($targetUid === $delegateToUid) fail(422, 'invalid_target', 'Impossible de déléguer à la même personne.');

    $targetStaff = one("SELECT id, role, matricule FROM agency_staff WHERE agency_id = ? AND user_id = ?", [$s['agency_id'], $targetUid])
        ?? fail(404, 'not_found', 'Membre source introuvable.');

    $delegateStaff = one("SELECT id, role, matricule FROM agency_staff WHERE agency_id = ? AND user_id = ? AND status = 'active'", [$s['agency_id'], $delegateToUid])
        ?? fail(404, 'delegate_not_found', 'Membre délégué introuvable ou inactif.');

    q("UPDATE agency_staff SET delegate_user_id = ? WHERE id = ?", [$delegateToUid, $targetStaff['id']]);

    audit((int) $s['id'], $s['agency_id'], 'staff.delegated', 'agency_staff', $targetStaff['id'], [
        'from_user_id' => $targetUid,
        'to_user_id' => $delegateToUid,
    ]);

    json_out([
        'ok' => true,
        'message' => "Les attributions et missions du poste ({$targetStaff['matricule']}) ont été déléguées au collaborateur ({$delegateStaff['matricule']})."
    ]);
});

