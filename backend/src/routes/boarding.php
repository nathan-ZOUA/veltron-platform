<?php
declare(strict_types=1);

// Module dédié à l'appel des passagers et gestion des sièges en embarquement
// Accessible aux agents d'embarquement (staff), managers et admins (SANS surcharger la secrétaire)

route('GET', '/api/boarding/trips', function () {
    $s = require_agency(['owner', 'manager', 'staff']);
    $rows = all("SELECT t.id, t.status, t.departs_at, t.arrives_at, t.delay_minutes, t.price, t.vip_price,
                        oc.name AS origin, dc.name AS destination, oc.timezone,
                        b.id AS bus_id, b.label AS bus_label, b.plate, b.seat_count, b.has_gps,
                        (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status IN ('valid','boarded')) AS booked_seats,
                        (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status = 'boarded') AS boarded_seats,
                        (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status = 'no_show') AS absent_seats,
                        (SELECT CONCAT(u.first_name, ' ', u.last_name) FROM trip_drivers td JOIN drivers d ON d.id = td.driver_id JOIN users u ON u.id = d.user_id WHERE td.trip_id = t.id LIMIT 1) AS driver_name,
                        (SELECT u.phone FROM trip_drivers td JOIN drivers d ON d.id = td.driver_id JOIN users u ON u.id = d.user_id WHERE td.trip_id = t.id LIMIT 1) AS driver_phone
                 FROM trips t
                 JOIN routes r ON r.id = t.route_id
                 JOIN cities oc ON oc.id = r.origin_city_id
                 JOIN cities dc ON dc.id = r.dest_city_id
                 JOIN buses b ON b.id = t.bus_id
                 WHERE t.agency_id = ? AND t.status IN ('scheduled', 'boarding', 'departed')
                 ORDER BY t.departs_at ASC", [$s['agency_id']]);

    foreach ($rows as &$tr) {
        $tr['booked_seats'] = (int) $tr['booked_seats'];
        $tr['boarded_seats'] = (int) $tr['boarded_seats'];
        $tr['absent_seats'] = (int) $tr['absent_seats'];
        $tr['seat_count'] = (int) $tr['seat_count'];
        $tr['is_full'] = $tr['boarded_seats'] >= $tr['seat_count'];
        $tr['departs_at'] = iso($tr['departs_at']);
        $tr['arrives_at'] = iso($tr['arrives_at']);
    }
    json_out($rows);
});

route('GET', '/api/boarding/trips/{id}/manifest', function (array $p) {
    $s = require_agency(['owner', 'manager', 'staff']);
    $trip = one("SELECT t.*, b.label AS bus_label, b.plate, b.seat_count, b.layout,
                        oc.name AS origin, dc.name AS destination, oc.timezone,
                        a.currency_code
                 FROM trips t
                 JOIN routes r ON r.id = t.route_id
                 JOIN cities oc ON oc.id = r.origin_city_id
                 JOIN cities dc ON dc.id = r.dest_city_id
                 JOIN buses b ON b.id = t.bus_id
                 JOIN agencies a ON a.id = t.agency_id
                 WHERE t.id = ? AND t.agency_id = ?", [(int) $p['id'], $s['agency_id']])
        ?? fail(404, 'not_found', 'Départ introuvable.');

    $seats = all('SELECT st.id, st.seat_no, st.row_no, st.col_no, st.seat_class
                  FROM seats st WHERE st.bus_id = ? ORDER BY st.seat_no', [$trip['bus_id']]);

    $tickets = all("SELECT k.id, k.seat_id, k.passenger_name, k.phone, k.status, k.checked_in_at, k.boarded_at, k.price,
                           COALESCE((SELECT SUM(l.pieces) FROM luggage l WHERE l.ticket_id = k.id), 0) AS luggage_pieces
                    FROM tickets k
                    WHERE k.trip_id = ? AND k.status IN ('valid', 'boarded', 'no_show')", [$trip['id']]);

    $ticketBySeat = [];
    $boardedCount = 0;
    $absentCount = 0;
    $validCount = 0;
    foreach ($tickets as $k) {
        $ticketBySeat[(int) $k['seat_id']] = [
            'ticket_id' => (int) $k['id'],
            'passenger_name' => $k['passenger_name'],
            'phone' => $k['phone'],
            'status' => $k['status'],
            'luggage_pieces' => (int) $k['luggage_pieces'],
            'boarded_at' => $k['boarded_at'] ? iso($k['boarded_at']) : null,
        ];
        if ($k['status'] === 'boarded') $boardedCount++;
        elseif ($k['status'] === 'no_show') $absentCount++;
        elseif ($k['status'] === 'valid') $validCount++;
    }

    $seatList = [];
    foreach ($seats as $st) {
        $sid = (int) $st['id'];
        $t = $ticketBySeat[$sid] ?? null;
        $seatList[] = [
            'id' => $sid,
            'seat_no' => (int) $st['seat_no'],
            'row_no' => (int) $st['row_no'],
            'col_no' => (int) $st['col_no'],
            'seat_class' => $st['seat_class'],
            'ticket' => $t,
            'state' => $t ? ($t['status'] === 'boarded' ? 'boarded' : ($t['status'] === 'no_show' ? 'absent' : 'valid')) : 'unbooked',
        ];
    }

    json_out([
        'trip' => [
            'id' => (int) $trip['id'],
            'status' => $trip['status'],
            'origin' => $trip['origin'],
            'destination' => $trip['destination'],
            'departs_at' => iso($trip['departs_at']),
            'bus_label' => $trip['bus_label'],
            'plate' => $trip['plate'],
            'seat_count' => (int) $trip['seat_count'],
            'currency_code' => $trip['currency_code'],
            'price' => (int) $trip['price'],
            'vip_price' => $trip['vip_price'] ? (int) $trip['vip_price'] : null,
            'layout' => $trip['layout'] ? json_decode($trip['layout'], true) : null,
        ],
        'seats' => $seatList,
        'summary' => [
            'total_seats' => (int) $trip['seat_count'],
            'boarded_count' => $boardedCount,
            'absent_count' => $absentCount,
            'valid_count' => $validCount,
            'unbooked_count' => max(0, (int) $trip['seat_count'] - $boardedCount - $validCount),
            'is_full' => $boardedCount >= (int) $trip['seat_count'],
        ]
    ]);
});

// Action de clic sur un siège lors de l'appel :
// - Si target_status = 'boarded' -> passe le siège au vert ('boarded')
// - Si target_status = 'absent'  -> passe le siège au rouge ('no_show') et libère la place
route('POST', '/api/boarding/trips/{id}/seat-click', function (array $p) {
    $s = require_agency(['owner', 'manager', 'staff']);
    $in = input();
    $seatId = (int) ($in['seat_id'] ?? 0);
    $targetStatus = (string) ($in['target_status'] ?? 'boarded'); // 'boarded' ou 'absent' ou 'reset'

    $trip = one('SELECT id, status FROM trips WHERE id = ? AND agency_id = ?', [(int) $p['id'], $s['agency_id']])
        ?? fail(404, 'not_found', 'Départ introuvable.');

    $ticket = one("SELECT id, status, passenger_name FROM tickets WHERE trip_id = ? AND seat_id = ? AND status IN ('valid', 'boarded', 'no_show')",
        [$trip['id'], $seatId]);

    if (!$ticket && $targetStatus === 'boarded') {
        fail(409, 'no_ticket', 'Ce siège n\'a pas de billet réservé. Utilisez l\'option de remplacement pour y faire monter un passager.');
    }
    if (!$ticket && $targetStatus === 'absent') {
        fail(409, 'no_ticket', 'Ce siège est vide.');
    }

    if ($targetStatus === 'boarded') {
        q("UPDATE tickets SET status = 'boarded', boarded_at = UTC_TIMESTAMP(), late_notice = NULL WHERE id = ?", [$ticket['id']]);
        audit((int) $s['id'], $s['agency_id'], 'boarding.board', 'ticket', (int) $ticket['id']);
        json_out(['ok' => true, 'action' => 'boarded', 'seat_id' => $seatId, 'passenger_name' => $ticket['passenger_name']]);
    } elseif ($targetStatus === 'absent') {
        // En passant en no_show, active_seat_id devient NULL -> la place est libérée !
        q("UPDATE tickets SET status = 'no_show', late_notice = 'Signalé absent à l\'appel' WHERE id = ?", [$ticket['id']]);
        audit((int) $s['id'], $s['agency_id'], 'boarding.absent', 'ticket', (int) $ticket['id']);
        json_out([
            'ok' => true,
            'action' => 'absent',
            'seat_id' => $seatId,
            'passenger_name' => $ticket['passenger_name'],
            'seat_freed' => true,
        ]);
    } elseif ($targetStatus === 'reset') {
        q("UPDATE tickets SET status = 'valid', boarded_at = NULL WHERE id = ?", [$ticket['id']]);
        json_out(['ok' => true, 'action' => 'reset', 'seat_id' => $seatId]);
    } else {
        fail(422, 'invalid_status', 'Statut cible invalide.');
    }
});

// Marquer tous les passagers actuellement valides à bord en un clic
route('POST', '/api/boarding/trips/{id}/board-all', function (array $p) {
    $s = require_agency(['owner', 'manager', 'staff']);
    $trip = one('SELECT id FROM trips WHERE id = ? AND agency_id = ?', [(int) $p['id'], $s['agency_id']])
        ?? fail(404, 'not_found', 'Départ introuvable.');

    $count = (int) (one("SELECT COUNT(*) AS c FROM tickets WHERE trip_id = ? AND status = 'valid'", [$trip['id']])['c'] ?? 0);
    q("UPDATE tickets SET status = 'boarded', boarded_at = UTC_TIMESTAMP() WHERE trip_id = ? AND status = 'valid'", [$trip['id']]);
    audit((int) $s['id'], $s['agency_id'], 'boarding.board_all', 'trip', (int) $trip['id'], ['count' => $count]);
    json_out(['ok' => true, 'count_boarded' => $count]);
});

// Liste des passagers SANS BAGAGES enregistrés sur un autre bus de l'agence
route('GET', '/api/boarding/trips/{id}/candidates-no-luggage', function (array $p) {
    $s = require_agency(['owner', 'manager', 'staff']);
    $tripId = (int) $p['id'];
    $trip = one('SELECT id, agency_id, route_id FROM trips WHERE id = ? AND agency_id = ?', [$tripId, $s['agency_id']])
        ?? fail(404, 'not_found', 'Départ introuvable.');

    $candidates = all("SELECT k.id AS ticket_id, k.passenger_name, k.phone, k.price,
                              t.id AS trip_id, t.departs_at,
                              b.label AS bus_label, b.plate, st.id AS seat_id, st.seat_no
                       FROM tickets k
                       JOIN trips t ON t.id = k.trip_id
                       JOIN buses b ON b.id = t.bus_id
                       JOIN seats st ON st.id = k.seat_id
                       WHERE t.agency_id = ?
                         AND t.id <> ?
                         AND t.status IN ('scheduled', 'boarding')
                         AND k.status = 'valid'
                         AND NOT EXISTS (SELECT 1 FROM luggage l WHERE l.ticket_id = k.id AND l.weight_kg > 0)
                       ORDER BY t.departs_at ASC
                       LIMIT 50", [$s['agency_id'], $tripId]);

    foreach ($candidates as &$c) {
        $c['departs_at'] = iso($c['departs_at']);
        $c['price'] = (int) $c['price'];
        $c['seat_no'] = (int) $c['seat_no'];
    }
    json_out($candidates);
});

// Réassignation du siège d'un absent :
// Option A : transfert d'un passager sans bagage (son ancien siège se libère immédiatement)
// Option B : passager payant en espèce sur place
route('POST', '/api/boarding/trips/{id}/assign-absent-seat', function (array $p) {
    $s = require_agency(['owner', 'manager', 'staff']);
    $tripId = (int) $p['id'];
    $in = input();
    $seatId = (int) ($in['seat_id'] ?? 0);
    $type = (string) ($in['type'] ?? ''); // 'candidate_transfer' ou 'cash_passenger'

    $trip = one("SELECT t.*, a.currency_code FROM trips t JOIN agencies a ON a.id = t.agency_id WHERE t.id = ? AND t.agency_id = ?",
        [$tripId, $s['agency_id']])
        ?? fail(404, 'not_found', 'Départ introuvable.');

    $seat = one('SELECT id, seat_no, seat_class FROM seats WHERE id = ? AND bus_id = ?', [$seatId, $trip['bus_id']])
        ?? fail(422, 'invalid_seat', 'Siège introuvable sur ce bus.');

    // Vérifier que le siège n'a pas déjà un billet 'valid' ou 'boarded'
    $existing = one("SELECT id, status FROM tickets WHERE trip_id = ? AND seat_id = ? AND status IN ('valid', 'boarded')",
        [$tripId, $seatId]);
    if ($existing) {
        fail(409, 'seat_occupied', 'Ce siège est déjà occupé. Marquez-le d\'abord absent.');
    }

    if ($type === 'candidate_transfer') {
        $candTicketId = (int) ($in['candidate_ticket_id'] ?? 0);
        $res = transaction(function () use ($s, $trip, $seat, $candTicketId) {
            $cand = one("SELECT k.*, t.id AS old_trip_id, t.departs_at AS old_departs, b.plate AS old_bus_plate, st.seat_no AS old_seat_no
                         FROM tickets k
                         JOIN trips t ON t.id = k.trip_id
                         JOIN buses b ON b.id = t.bus_id
                         JOIN seats st ON st.id = k.seat_id
                         WHERE k.id = ? AND t.agency_id = ? FOR UPDATE", [$candTicketId, $s['agency_id']])
                ?? fail(404, 'candidate_not_found', 'Passager candidat introuvable.');

            if ($cand['status'] !== 'valid') fail(409, 'bad_state', 'Ce billet n\'est plus disponible.');

            // Vérifier bagage
            if (one('SELECT id FROM luggage WHERE ticket_id = ? AND weight_kg > 0 LIMIT 1', [$cand['id']])) {
                fail(422, 'has_luggage', 'Ce passager a des bagages enregistrés.');
            }

            // 1. Libérer l'ancien siège en passant l'ancien billet en 'transferred'
            // Cela met automatiquement active_seat_id à NULL dans son ancien bus !
            q("UPDATE tickets SET status = 'transferred' WHERE id = ?", [$cand['id']]);

            // 2. Insérer le nouveau billet dans ce bus sur le siège de l'absent avec statut 'boarded'
            $price = ($seat['seat_class'] === 'vip' && $trip['vip_price']) ? (int) $trip['vip_price'] : (int) $trip['price'];
            q("INSERT INTO tickets (booking_id, trip_id, seat_id, passenger_name, id_type, id_number, phone, qr_token, status, checked_in_at, boarded_at, price)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'boarded', UTC_TIMESTAMP(), UTC_TIMESTAMP(), ?)",
                [$cand['booking_id'], $trip['id'], $seat['id'], $cand['passenger_name'], $cand['id_type'], $cand['id_number'], $cand['phone'], new_qr_token(), $price]);
            $newTicketId = (int) db()->lastInsertId();

            // 3. Tracer le transfert dans ticket_transfers
            q("INSERT INTO ticket_transfers (old_ticket_id, new_ticket_id, from_trip_id, to_trip_id, kind, passenger_consent, done_by)
               VALUES (?, ?, ?, ?, 'advance_fill', 1, ?)",
                [$cand['id'], $newTicketId, $cand['old_trip_id'], $trip['id'], $s['id']]);

            audit((int) $s['id'], $s['agency_id'], 'boarding.seat_transfer', 'ticket', $newTicketId, [
                'freed_bus' => $cand['old_bus_plate'],
                'freed_seat' => $cand['old_seat_no'],
                'passenger' => $cand['passenger_name'],
            ]);

            return [
                'passenger_name' => $cand['passenger_name'],
                'freed_bus_plate' => $cand['old_bus_plate'],
                'freed_seat_no' => (int) $cand['old_seat_no'],
                'new_seat_no' => (int) $seat['seat_no'],
            ];
        });

        json_out([
            'ok' => true,
            'message' => "✓ {$res['passenger_name']} a embarqué sur le siège #{$res['new_seat_no']}. Son ancienne place #{$res['freed_seat_no']} (Bus {$res['freed_bus_plate']}) est désormais LIBÉRÉE !",
            'data' => $res,
        ]);
    } elseif ($type === 'cash_passenger') {
        $pName = trim((string) ($in['passenger_name'] ?? ''));
        if (!$pName) fail(422, 'missing_name', 'Veuillez saisir le nom du passager.');
        $phone = str_in($in['phone'] ?? '', 25) ?: null;

        $res = transaction(function () use ($s, $trip, $seat, $pName, $phone) {
            $price = ($seat['seat_class'] === 'vip' && $trip['vip_price']) ? (int) $trip['vip_price'] : (int) $trip['price'];
            $ref = new_reference();

            // Créer réservation guichet payée en espèce
            q("INSERT INTO bookings (reference, agency_id, trip_id, user_id, channel, status, total, currency_code)
               VALUES (?, ?, ?, NULL, 'counter', 'paid', ?, ?)",
                [$ref, $trip['agency_id'], $trip['id'], $price, $trip['currency_code']]);
            $bookingId = (int) db()->lastInsertId();

            // Créer le billet directement 'boarded'
            q("INSERT INTO tickets (booking_id, trip_id, seat_id, passenger_name, id_type, id_number, phone, qr_token, status, checked_in_at, boarded_at, price)
               VALUES (?, ?, ?, ?, 'CNI', NULL, ?, ?, 'boarded', UTC_TIMESTAMP(), UTC_TIMESTAMP(), ?)",
                [$bookingId, $trip['id'], $seat['id'], $pName, $phone, new_qr_token(), $price]);
            $newTicketId = (int) db()->lastInsertId();

            // Enregistrer paiement en espèce
            q("INSERT INTO payments (booking_id, provider, provider_ref, payer_account, agency_payout_account, idempotency_key, amount, agency_net_amount, currency_code, status)
               VALUES (?, 'cash', 'EMBARQUEMENT_ESPECE', 'CLIENT_SUR_PLACE', 'CAISSE_ESPECE', ?, ?, ?, ?, 'succeeded')",
                [$bookingId, new_reference(), $price, $price, $trip['currency_code']]);

            audit((int) $s['id'], $s['agency_id'], 'boarding.cash_passenger', 'ticket', $newTicketId, [
                'passenger' => $pName,
                'seat_no' => $seat['seat_no'],
                'amount' => $price,
            ]);

            return [
                'passenger_name' => $pName,
                'seat_no' => (int) $seat['seat_no'],
                'price' => $price,
                'reference' => $ref,
            ];
        });

        json_out([
            'ok' => true,
            'message' => "✓ {$res['passenger_name']} enregistré et embarqué sur le siège #{$res['seat_no']} (Paiement en espèce : {$res['price']} {$trip['currency_code']}).",
            'data' => $res,
        ]);
    } else {
        fail(422, 'invalid_type', 'Type de réassignation invalide.');
    }
});

// Valider l'embarquement et marquer le départ du bus
route('POST', '/api/boarding/trips/{id}/depart', function (array $p) {
    $s = require_agency(['owner', 'manager', 'staff']);
    $trip = one('SELECT id, status FROM trips WHERE id = ? AND agency_id = ?', [(int) $p['id'], $s['agency_id']])
        ?? fail(404, 'not_found', 'Départ introuvable.');

    q("UPDATE trips SET status = 'departed', actual_departed_at = COALESCE(actual_departed_at, UTC_TIMESTAMP()) WHERE id = ?", [$trip['id']]);
    q("INSERT INTO trip_status_updates (trip_id, user_id, kind, progress_pct, note)
       VALUES (?, ?, 'departed', 0, 'Embarquement validé : départ du bus lancé par le personnel de quai')",
        [$trip['id'], $s['id']]);

    $commission = settle_trip_commission((int) $trip['id'], 'departed');
    audit((int) $s['id'], $s['agency_id'], 'boarding.depart', 'trip', (int) $trip['id']);

    json_out(['ok' => true, 'commission' => $commission]);
});
