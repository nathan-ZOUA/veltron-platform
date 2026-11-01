<?php
declare(strict_types=1);

// =============================================================================
// Guichet / Secrétaire : départs & arrivées, appel des passagers, retardataires,
// absents, bagages, vente guichet, et remplissage des places libérées par des
// passagers SANS bagage d'un départ proche (écart <= fill_window_minutes, ex. 40 min)
// après confirmation physique de leur accord.
// =============================================================================

function desk_trip(int $tripId, array $roles = ['owner', 'manager', 'secretary', 'staff']): array
{
    $s = require_agency($roles);
    $trip = one('SELECT t.id, t.agency_id, t.route_id, t.bus_id, t.departs_at, t.arrives_at, t.status,
                        t.price, t.vip_price, t.delay_minutes, a.fill_window_minutes, a.currency_code
                 FROM trips t JOIN agencies a ON a.id = t.agency_id
                 WHERE t.id = ? AND t.agency_id = ?', [$tripId, $s['agency_id']])
        ?? fail(404, 'not_found', 'Départ introuvable dans votre agence.');
    return [$s, $trip];
}

// Départs des prochaines 48 h (et des 4 dernières heures) de l'agence connectée
route('GET', '/api/desk/trips', function () {
    $s = require_agency(['owner', 'manager', 'secretary', 'staff']);
    expire_holds();

    $trips = all("SELECT t.id, t.agency_id, t.departs_at, t.arrives_at, t.status, t.delay_minutes, t.price,
                         oc.name AS origin, dc.name AS destination, oc.timezone,
                         b.label AS bus_label, b.plate, b.seat_count, a.fill_window_minutes,
                         (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status IN ('valid','boarded')) AS booked,
                         (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status = 'boarded') AS boarded,
                         (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status = 'no_show') AS no_shows
                  FROM trips t
                  JOIN agencies a ON a.id = t.agency_id
                  JOIN routes r ON r.id = t.route_id
                  JOIN cities oc ON oc.id = r.origin_city_id
                  JOIN cities dc ON dc.id = r.dest_city_id
                  JOIN buses b ON b.id = t.bus_id
                  WHERE t.agency_id = ? AND t.status <> 'cancelled'
                    AND t.departs_at BETWEEN DATE_SUB(UTC_TIMESTAMP(), INTERVAL 4 HOUR)
                                         AND DATE_ADD(UTC_TIMESTAMP(), INTERVAL 48 HOUR)
                  ORDER BY t.departs_at", [$s['agency_id']]);
    foreach ($trips as &$t) {
        $t['departs_at'] = iso($t['departs_at']);
        $t['arrives_at'] = iso($t['arrives_at']);
    }
    json_out($trips);
});

// Manifeste d'embarquement
route('GET', '/api/desk/trips/{id}/manifest', function (array $p) {
    [$s, $trip] = desk_trip((int) $p['id']);
    $showIdNumber = in_array($s['role'], ['owner', 'manager', 'secretary'], true);

    $tickets = all("SELECT k.id, k.status, k.passenger_name, k.id_type, k.id_number, k.phone,
                           k.checked_in_at, k.late_notice, k.seat_id,
                           st.seat_no, st.seat_class, b.reference,
                           COALESCE((SELECT SUM(l.pieces) FROM luggage l WHERE l.ticket_id = k.id), 0) AS luggage_pieces
                    FROM tickets k
                    JOIN bookings b ON b.id = k.booking_id
                    JOIN seats st ON st.id = k.seat_id
                    WHERE k.trip_id = ? AND k.status IN ('valid','boarded','no_show')
                    ORDER BY b.reference, st.seat_no", [$trip['id']]);
    foreach ($tickets as &$k) {
        $k['luggage_pieces'] = (int) $k['luggage_pieces'];
        if (!$showIdNumber && $k['id_number']) {
            $k['id_number'] = '••••' . substr((string) $k['id_number'], -3);
        }
    }

    if ($showIdNumber) {
        audit((int) $s['id'], (int) $trip['agency_id'], 'id.view', 'trip', (int) $trip['id'], ['count' => count($tickets)]);
    }

    $seats = all('SELECT st.id, st.seat_no, st.row_no, st.col_no, st.seat_class, b.layout
                  FROM seats st JOIN buses b ON b.id = st.bus_id WHERE st.bus_id = ? ORDER BY st.seat_no', [$trip['bus_id']]);
    $layout = $seats ? json_decode($seats[0]['layout'], true) : null;
    foreach ($seats as &$st) unset($st['layout']);

    json_out([
        'trip_id' => (int) $trip['id'],
        'departs_at' => iso($trip['departs_at']),
        'arrives_at' => iso($trip['arrives_at']),
        'status' => $trip['status'],
        'delay_minutes' => (int) $trip['delay_minutes'],
        'fill_window_minutes' => (int) $trip['fill_window_minutes'],
        'price' => (int) $trip['price'],
        'currency_code' => $trip['currency_code'],
        'layout' => $layout,
        'seats' => $seats,
        'tickets' => $tickets,
    ]);
});

// Actions sur un billet : checkin, board, late (client signalé en retard), absent (no_show), undo
route('POST', '/api/desk/tickets/{id}/action', function (array $p) {
    $k = one('SELECT id, status, trip_id FROM tickets WHERE id = ?', [(int) $p['id']])
        ?? fail(404, 'not_found', 'Billet introuvable.');
    [$s, $trip] = desk_trip((int) $k['trip_id'], ['owner', 'manager', 'secretary', 'staff']);
    $in = input();
    $action = (string) ($in['action'] ?? '');

    if (in_array($trip['status'], ['cancelled', 'completed'], true)) fail(409, 'trip_closed', 'Ce départ est clôturé.');

    switch ($action) {
        case 'checkin':
            if ($k['status'] !== 'valid') fail(409, 'bad_state', 'Billet non valide.');
            q('UPDATE tickets SET checked_in_at = UTC_TIMESTAMP(), late_notice = NULL WHERE id = ?', [$k['id']]);
            break;
        case 'board':
            if ($k['status'] !== 'valid') fail(409, 'bad_state', 'Billet non valide ou déjà embarqué.');
            q("UPDATE tickets SET status = 'boarded', boarded_at = UTC_TIMESTAMP(), late_notice = NULL WHERE id = ?", [$k['id']]);
            break;
        case 'late':
            if ($k['status'] !== 'valid') fail(409, 'bad_state', 'Billet non valide.');
            $note = str_in($in['note'] ?? 'En route vers la gare', 120);
            q('UPDATE tickets SET late_notice = ? WHERE id = ?', [$note, $k['id']]);
            break;
        case 'absent':
            if (!in_array($s['role'], ['owner', 'manager', 'secretary'], true)) fail(403, 'forbidden', 'Action réservée à la secrétaire.');
            if ($k['status'] !== 'valid') fail(409, 'bad_state', 'Billet non valide.');
            q("UPDATE tickets SET status = 'no_show' WHERE id = ?", [$k['id']]);
            break;
        case 'undo':
            if (!in_array($s['role'], ['owner', 'manager', 'secretary'], true)) fail(403, 'forbidden', 'Action réservée à la secrétaire.');
            if (!in_array($k['status'], ['boarded', 'no_show'], true)) fail(409, 'bad_state', 'Rien à annuler.');
            try {
                q("UPDATE tickets SET status = 'valid', boarded_at = NULL WHERE id = ?", [$k['id']]);
            } catch (PDOException $e) {
                if ($e->getCode() === '23000') fail(409, 'seat_taken', 'Ce siège a été réattribué à un autre passager.');
                throw $e;
            }
            break;
        default:
            fail(422, 'invalid_action', 'Action inconnue.');
    }
    audit((int) $s['id'], (int) $trip['agency_id'], 'ticket.' . $action, 'ticket', (int) $k['id']);
    json_out(['ok' => true]);
});

// Scan QR code
route('POST', '/api/desk/scan', function () {
    $s = require_agency(['owner', 'manager', 'secretary', 'staff']);
    $token = preg_replace('/^VLT:/', '', trim((string) (input()['qr_token'] ?? '')));
    $k = one("SELECT k.id, k.status, k.passenger_name, k.trip_id, st.seat_no, b.reference, t.agency_id
              FROM tickets k
              JOIN seats st ON st.id = k.seat_id
              JOIN bookings b ON b.id = k.booking_id
              JOIN trips t ON t.id = k.trip_id
              WHERE k.qr_token = ? AND t.agency_id = ?", [$token, $s['agency_id']])
        ?? fail(404, 'unknown_ticket', 'Billet inconnu pour votre agence.');

    if ($k['status'] === 'boarded') fail(409, 'already_boarded', 'Ce billet a déjà été scanné.');
    if ($k['status'] !== 'valid') fail(422, 'ticket_' . $k['status'], 'Billet non valable (statut : ' . $k['status'] . ').');

    q("UPDATE tickets SET status = 'boarded', boarded_at = UTC_TIMESTAMP(), late_notice = NULL WHERE id = ?", [$k['id']]);
    audit((int) $s['id'], (int) $s['agency_id'], 'ticket.scan', 'ticket', (int) $k['id']);
    json_out([
        'ok' => true,
        'passenger_name' => $k['passenger_name'],
        'seat_no' => (int) $k['seat_no'],
        'reference' => $k['reference'],
        'trip_id' => (int) $k['trip_id'],
    ]);
});

// Candidats sans bagage d'un départ proche (écart <= fill_window_minutes, ex. 40 min maximum)
route('GET', '/api/desk/trips/{id}/fill-candidates', function (array $p) {
    [, $trip] = desk_trip((int) $p['id'], ['owner', 'manager', 'secretary']);
    $window = (int) $trip['fill_window_minutes'];

    $free = all("SELECT st.id, st.seat_no, st.seat_class FROM seats st
                 WHERE st.bus_id = ?
                   AND NOT EXISTS (SELECT 1 FROM tickets k WHERE k.trip_id = ? AND k.seat_id = st.id AND k.active_seat_id IS NOT NULL)
                 ORDER BY st.seat_no", [$trip['bus_id'], $trip['id']]);

    $candidates = all("SELECT k.id AS ticket_id, k.passenger_name, k.checked_in_at, k.price,
                              st.seat_no, st.seat_class, b.reference,
                              nt.id AS from_trip_id, nt.departs_at AS from_departs_at,
                              TIMESTAMPDIFF(MINUTE, ?, nt.departs_at) AS gap_minutes
                       FROM trips nt
                       JOIN tickets k ON k.trip_id = nt.id AND k.status = 'valid'
                       JOIN bookings b ON b.id = k.booking_id
                       JOIN seats st ON st.id = k.seat_id
                       WHERE nt.agency_id = ? AND nt.route_id = ? AND nt.status IN ('scheduled','boarding')
                         AND nt.departs_at > ?
                         AND TIMESTAMPDIFF(MINUTE, ?, nt.departs_at) <= ?
                         AND nt.id <> ?
                         AND NOT EXISTS (SELECT 1 FROM luggage l WHERE l.ticket_id = k.id)
                       ORDER BY (k.checked_in_at IS NULL), nt.departs_at, b.reference
                       LIMIT 40",
        [$trip['departs_at'], $trip['agency_id'], $trip['route_id'], $trip['departs_at'], $trip['departs_at'], $window, $trip['id']]);

    foreach ($candidates as &$c) {
        $c['from_departs_at'] = iso($c['from_departs_at']);
        $c['checked_in'] = $c['checked_in_at'] !== null;
        $c['gap_minutes'] = (int) $c['gap_minutes'];
        unset($c['checked_in_at']);
    }
    json_out([
        'fill_window_minutes' => $window,
        'free_seats' => $free,
        'candidates' => $candidates,
    ]);
});

// Transfert immédiat d'un passager sans bagage (uniquement si écart <= fill_window_minutes ET accord physique)
route('POST', '/api/desk/tickets/{id}/transfer', function (array $p) {
    $s = require_agency(['owner', 'manager', 'secretary']);
    $in = input();

    $newId = transaction(function () use ($p, $s, $in) {
        $old = one("SELECT k.*, t.agency_id, t.route_id, t.departs_at AS old_departs, b.user_id, a.fill_window_minutes
                    FROM tickets k
                    JOIN trips t ON t.id = k.trip_id
                    JOIN bookings b ON b.id = k.booking_id
                    JOIN agencies a ON a.id = t.agency_id
                    WHERE k.id = ? AND t.agency_id = ? FOR UPDATE", [(int) $p['id'], $s['agency_id']])
            ?? fail(404, 'not_found', 'Billet introuvable.');

        if ($old['status'] !== 'valid') fail(409, 'bad_state', 'Seul un billet valide peut être avancé.');
        if (empty($in['consent'])) {
            fail(422, 'consent_required', 'Vous devez demander physiquement l\'accord du passager avant de le transférer.');
        }
        if (one('SELECT id FROM luggage WHERE ticket_id = ? LIMIT 1', [$old['id']])) {
            fail(422, 'has_luggage', 'Refusé : un passager avec bagages enregistrés ne peut pas être avancé sur un départ imminent.');
        }

        $target = one("SELECT id, agency_id, route_id, bus_id, departs_at, price, vip_price FROM trips
                       WHERE id = ? AND agency_id = ? AND status IN ('scheduled','boarding') FOR UPDATE",
            [(int) ($in['to_trip_id'] ?? 0), $s['agency_id']])
            ?? fail(404, 'trip_unavailable', 'Départ cible indisponible.');

        if ((int) $target['route_id'] !== (int) $old['route_id']) {
            fail(422, 'wrong_route', 'Le transfert doit rester sur la même ligne.');
        }
        $gapMin = (int) round((strtotime($old['old_departs'] . ' UTC') - strtotime($target['departs_at'] . ' UTC')) / 60);
        $maxWindow = (int) $old['fill_window_minutes'];
        if ($gapMin <= 0) {
            fail(422, 'not_earlier', 'Le départ cible doit partir avant le départ initial du passager.');
        }
        if ($gapMin > $maxWindow) {
            fail(422, 'window_exceeded', "Écart trop grand ({$gapMin} min) : la règle de l'agence autorise au maximum {$maxWindow} min entre les deux départs.");
        }

        $seat = one('SELECT id, seat_class FROM seats WHERE id = ? AND bus_id = ?', [(int) ($in['seat_id'] ?? 0), $target['bus_id']])
            ?? fail(422, 'invalid_seat', 'Siège invalide.');
        $newPrice = ($seat['seat_class'] === 'vip' && $target['vip_price']) ? (int) $target['vip_price'] : (int) $target['price'];
        if ($newPrice > (int) $old['price']) {
            fail(422, 'fare_difference', 'Ce siège coûte plus cher : choisissez un siège de même tarif.');
        }

        try {
            q("INSERT INTO tickets (booking_id, trip_id, seat_id, passenger_name, id_type, id_number, phone, qr_token, status, checked_in_at, price)
               VALUES (?,?,?,?,?,?,?,?, 'valid', UTC_TIMESTAMP(), ?)",
                [$old['booking_id'], $target['id'], $seat['id'], $old['passenger_name'], $old['id_type'],
                 $old['id_number'], $old['phone'], new_qr_token(), $old['price']]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail(409, 'seat_taken', 'Ce siège vient d\'être occupé.');
            throw $e;
        }
        $newId = (int) db()->lastInsertId();

        q("UPDATE tickets SET status = 'transferred' WHERE id = ?", [$old['id']]);
        q("INSERT INTO ticket_transfers (old_ticket_id, new_ticket_id, from_trip_id, to_trip_id, kind, passenger_consent, done_by)
           VALUES (?,?,?,?, 'advance_fill', 1, ?)", [$old['id'], $newId, $old['trip_id'], $target['id'], $s['id']]);
        if ($old['user_id']) {
            notify_user((int) $old['user_id'], 'ticket_transferred', ['old_ticket_id' => (int) $old['id'], 'new_ticket_id' => $newId]);
        }
        audit((int) $s['id'], (int) $s['agency_id'], 'ticket.advance_fill', 'ticket', (int) $old['id'],
            ['to_trip_id' => (int) $target['id'], 'new_ticket_id' => $newId, 'gap_minutes' => $gapMin]);
        return $newId;
    });

    json_out(['transferred' => true, 'new_ticket_id' => $newId]);
});

// Vente directe au guichet (ajout d'un passager sans bagage / de dernière minute sur un siège libre)
route('POST', '/api/desk/trips/{id}/sell', function (array $p) {
    [$s, $trip] = desk_trip((int) $p['id'], ['owner', 'manager', 'secretary']);
    $in = input();
    $name = str_in($in['passenger_name'] ?? '', 120);
    $seatId = (int) ($in['seat_id'] ?? 0);
    if ($name === '' || $seatId <= 0) fail(422, 'invalid_fields', 'Nom du passager et siège obligatoires.');

    $res = transaction(function () use ($s, $trip, $in, $name, $seatId) {
        $seat = one('SELECT id, seat_no, seat_class FROM seats WHERE id = ? AND bus_id = ?', [$seatId, $trip['bus_id']])
            ?? fail(422, 'invalid_seat', 'Siège invalide.');
        $price = ($seat['seat_class'] === 'vip' && $trip['vip_price']) ? (int) $trip['vip_price'] : (int) $trip['price'];
        $ref = new_reference();

        q("INSERT INTO bookings (reference, agency_id, trip_id, user_id, channel, status, total, currency_code)
           VALUES (?,?,?, NULL, 'counter', 'paid', ?, ?)",
            [$ref, $trip['agency_id'], $trip['id'], $price, $trip['currency_code']]);
        $bookingId = (int) db()->lastInsertId();

        try {
            q("INSERT INTO tickets (booking_id, trip_id, seat_id, passenger_name, id_type, id_number, phone, qr_token, status, checked_in_at, price)
               VALUES (?,?,?,?,?,?,?,?, 'valid', UTC_TIMESTAMP(), ?)",
                [$bookingId, $trip['id'], $seat['id'], $name,
                 str_in($in['id_type'] ?? 'CNI', 30) ?: 'CNI',
                 str_in($in['id_number'] ?? '', 40) ?: null,
                 str_in($in['phone'] ?? '', 25) ?: null,
                 new_qr_token(), $price]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000') fail(409, 'seat_taken', 'Ce siège est déjà occupé.');
            throw $e;
        }
        $ticketId = (int) db()->lastInsertId();

        q("INSERT INTO payments (booking_id, provider, provider_ref, idempotency_key, amount, currency_code, status, sandbox)
           VALUES (?, 'cash', ?, ?, ?, ?, 'succeeded', 1)",
            [$bookingId, 'CSH-' . strtoupper(bin2hex(random_bytes(4))), 'cnt-' . bin2hex(random_bytes(8)), $price, $trip['currency_code']]);
        // Si le bus devient plein avec cette vente guichet, reversement automatique des 0,5 % à VELTRON
        settle_trip_commission((int) $trip['id']);
        audit((int) $s['id'], (int) $s['agency_id'], 'ticket.counter_sale', 'ticket', $ticketId, ['seat_no' => $seat['seat_no']]);
        return ['reference' => $ref, 'ticket_id' => $ticketId, 'seat_no' => (int) $seat['seat_no']];
    });

    json_out($res, 201);
});

// Enregistrement d'un bagage au guichet
route('POST', '/api/desk/tickets/{id}/luggage', function (array $p) {
    $s = require_agency(['owner', 'manager', 'secretary', 'staff']);
    $k = one("SELECT k.id, k.status, k.trip_id, a.free_baggage_kg, a.baggage_fee_per_kg, t.agency_id
              FROM tickets k JOIN trips t ON t.id = k.trip_id JOIN agencies a ON a.id = t.agency_id
              WHERE k.id = ? AND t.agency_id = ?", [(int) $p['id'], $s['agency_id']])
        ?? fail(404, 'not_found', 'Billet introuvable.');
    if (!in_array($k['status'], ['valid', 'boarded'], true)) fail(409, 'bad_state', 'Billet non valide.');

    $in = input();
    $weight = round((float) ($in['weight_kg'] ?? 0), 1);
    $pieces = max(1, (int) ($in['pieces'] ?? 1));
    if ($weight <= 0 || $weight > 100) fail(422, 'invalid_weight', 'Poids invalide.');

    $already = one('SELECT COALESCE(SUM(weight_kg), 0) AS w FROM luggage WHERE ticket_id = ?', [$k['id']]);
    $extra = max(0.0, ((float) $already['w'] + $weight) - (float) $k['free_baggage_kg'])
           - max(0.0, (float) $already['w'] - (float) $k['free_baggage_kg']);
    $fee = (int) ceil($extra * (int) $k['baggage_fee_per_kg']);

    $tag = 'BG-' . random_code(6);
    q('INSERT INTO luggage (ticket_id, tag_code, pieces, weight_kg, fee, created_by) VALUES (?,?,?,?,?,?)',
        [$k['id'], $tag, $pieces, $weight, $fee, $s['id']]);
    audit((int) $s['id'], (int) $s['agency_id'], 'luggage.add', 'ticket', (int) $k['id'], ['tag' => $tag]);
    json_out(['tag_code' => $tag, 'fee' => $fee], 201);
});
