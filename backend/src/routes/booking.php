<?php
declare(strict_types=1);

// =============================================================================
// Réservation, paiement, billets, remboursement (2 h), report, avis & fidélité annuelle.
// =============================================================================

const HOLD_MINUTES = 15;
const MAX_SEATS_PER_BOOKING = 6;

route('POST', '/api/bookings', function () {
    $user = require_passenger();
    $in = input();
    $tripId = (int) ($in['trip_id'] ?? 0);
    $passengers = $in['passengers'] ?? [];

    if (!is_array($passengers) || count($passengers) < 1 || count($passengers) > MAX_SEATS_PER_BOOKING) {
        fail(422, 'invalid_passengers', 'Choisissez entre 1 et ' . MAX_SEATS_PER_BOOKING . ' sièges.');
    }

    $bookingId = transaction(function () use ($user, $tripId, $passengers) {
        expire_holds();
        $trip = one("SELECT t.id, t.agency_id, t.bus_id, t.price, t.vip_price, a.currency_code
                     FROM trips t JOIN agencies a ON a.id = t.agency_id
                     WHERE t.id = ? AND t.status IN ('scheduled','boarding') AND t.departs_at > UTC_TIMESTAMP()
                       AND a.status = 'active' FOR UPDATE", [$tripId])
            ?? fail(404, 'trip_unavailable', 'Ce départ n\'est plus disponible.');

        $reference = new_reference();
        q("INSERT INTO bookings (reference, agency_id, trip_id, user_id, channel, status, total, currency_code, expires_at)
           VALUES (?,?,?,?, 'online', 'pending', 0, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL " . HOLD_MINUTES . " MINUTE))",
            [$reference, $trip['agency_id'], $tripId, $user['id'], $trip['currency_code']]);
        $bookingId = (int) db()->lastInsertId();

        $total = 0;
        foreach ($passengers as $pax) {
            $name = str_in($pax['name'] ?? '', 120);
            if ($name === '') fail(422, 'invalid_name', 'Le nom de chaque passager est obligatoire.');

            $seat = one('SELECT id, seat_class FROM seats WHERE id = ? AND bus_id = ?',
                [(int) ($pax['seat_id'] ?? 0), $trip['bus_id']])
                ?? fail(422, 'invalid_seat', 'Siège invalide pour ce bus.');
            $price = ($seat['seat_class'] === 'vip' && $trip['vip_price']) ? (int) $trip['vip_price'] : (int) $trip['price'];

            try {
                q("INSERT INTO tickets (booking_id, trip_id, seat_id, passenger_name, id_type, id_number, phone,
                                        qr_token, status, price) VALUES (?,?,?,?,?,?,?,?, 'held', ?)",
                    [$bookingId, $tripId, $seat['id'], $name,
                     str_in($pax['id_type'] ?? '', 30) ?: null,
                     str_in($pax['id_number'] ?? '', 40) ?: null,
                     str_in($pax['phone'] ?? '', 25) ?: null,
                     new_qr_token(), $price]);
            } catch (PDOException $e) {
                if ($e->getCode() === '23000') fail(409, 'seat_taken', 'Un des sièges vient d\'être réservé. Choisissez-en un autre.');
                throw $e;
            }
            $total += $price;
        }
        q('UPDATE bookings SET total = ? WHERE id = ?', [$total, $bookingId]);
        return $bookingId;
    });

    $booking = one('SELECT id, reference, total, currency_code, expires_at FROM bookings WHERE id = ?', [$bookingId]);
    $booking['expires_at'] = iso($booking['expires_at']);
    json_out($booking, 201);
});

// Modes de paiement enregistrés du passager (déduction directe lors de l'achat)
route('GET', '/api/me/payment-methods', function () {
    $user = require_passenger();
    $methods = all('SELECT id, provider, account_number, account_holder, balance, currency_code, is_default, created_at
                    FROM passenger_payment_methods WHERE user_id = ? ORDER BY is_default DESC, id DESC', [$user['id']]);
    if (!$methods) {
        $holder = trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')) ?: 'Passager VELTRON';
        $phone = $user['phone'] ?? '+237 690 00 00 00';
        q("INSERT INTO passenger_payment_methods (user_id, provider, account_number, account_holder, balance, currency_code, is_default)
           VALUES (?, 'orange_money', ?, ?, 500000, 'XAF', 1)", [$user['id'], $phone, $holder]);
        $methods = all('SELECT id, provider, account_number, account_holder, balance, currency_code, is_default, created_at
                        FROM passenger_payment_methods WHERE user_id = ? ORDER BY is_default DESC, id DESC', [$user['id']]);
    }
    foreach ($methods as &$m) {
        $m['id'] = (int) $m['id'];
        $m['balance'] = (int) $m['balance'];
        $m['is_default'] = (bool) $m['is_default'];
        $m['created_at'] = iso($m['created_at']);
    }
    json_out($methods);
});

route('POST', '/api/me/payment-methods', function () {
    $user = require_passenger();
    $in = input();
    $provider = strtolower(trim((string) ($in['provider'] ?? 'orange_money')));
    if (!in_array($provider, ['orange_money', 'mtn_momo', 'wave', 'card'], true)) $provider = 'orange_money';
    $accNum = str_in($in['account_number'] ?? '', 80);
    $holder = str_in($in['account_holder'] ?? (($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')), 120);
    $balance = isset($in['balance']) ? max(0, (int) $in['balance']) : 500000;
    $currency = strtoupper(str_in($in['currency_code'] ?? 'XAF', 3)) ?: 'XAF';
    if ($accNum === '') fail(422, 'missing_account', 'Veuillez saisir votre numéro Mobile Money ou de carte.');

    q('UPDATE passenger_payment_methods SET is_default = 0 WHERE user_id = ?', [$user['id']]);
    q('INSERT INTO passenger_payment_methods (user_id, provider, account_number, account_holder, balance, currency_code, is_default)
       VALUES (?, ?, ?, ?, ?, ?, 1)',
        [$user['id'], $provider, $accNum, $holder ?: 'Titulaire', $balance, $currency]);
    $id = (int) db()->lastInsertId();
    json_out(['id' => $id, 'provider' => $provider, 'account_number' => $accNum, 'account_holder' => $holder, 'balance' => $balance], 201);
});

route('POST', '/api/bookings/{id}/pay', function (array $p) {
    $user = require_passenger();
    $in = input();
    $key = str_in($in['idempotency_key'] ?? '', 80);
    if ($key === '') fail(422, 'missing_key', 'Clé d\'idempotence obligatoire.');

    $provider = strtolower(trim((string) ($in['provider'] ?? 'orange_money')));
    if (!in_array($provider, ['orange_money', 'mtn_momo', 'wave', 'card', 'sandbox'], true)) {
        fail(422, 'provider_unavailable', 'Mode de paiement non reconnu.');
    }
    $payerAccountInput = str_in($in['payer_account'] ?? '', 80);
    $payerHolderInput = str_in($in['payer_name'] ?? (($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? '')), 120);
    $methodId = !empty($in['payment_method_id']) ? (int) $in['payment_method_id'] : 0;

    $pointsEarned = 0;
    $existingStatus = null;
    $transferDetails = [];

    transaction(function () use ($p, $user, $key, $provider, $payerAccountInput, $payerHolderInput, $methodId, &$pointsEarned, &$existingStatus, &$transferDetails) {
        $booking = one('SELECT b.id, b.user_id, b.agency_id, b.trip_id, b.status, b.total, b.currency_code, b.expires_at,
                               a.points_per_trip, a.commission_rate_bps, a.payout_method, a.payout_account_number, a.payout_account_name, a.name AS agency_name
                        FROM bookings b JOIN agencies a ON a.id = b.agency_id
                        WHERE b.id = ? FOR UPDATE', [(int) $p['id']]);
        if (!$booking || (int) $booking['user_id'] !== (int) $user['id']) fail(404, 'not_found', 'Réservation introuvable.');

        if (one('SELECT id FROM payments WHERE idempotency_key = ?', [$key])) {
            $existingStatus = $booking['status'];
            return;
        }
        if ($booking['status'] !== 'pending') fail(409, 'not_payable', 'Cette réservation ne peut plus être payée.');
        if (strtotime($booking['expires_at'] . ' UTC') < time()) fail(410, 'expired', 'Le délai de paiement est dépassé.');

        $amount = (int) $booking['total'];
        // Récupération ou enregistrement automatique du mode de paiement du passager
        $pm = null;
        if ($methodId > 0) {
            $pm = one('SELECT * FROM passenger_payment_methods WHERE id = ? AND user_id = ? FOR UPDATE', [$methodId, $user['id']]);
        }
        if (!$pm && $payerAccountInput !== '') {
            $pm = one('SELECT * FROM passenger_payment_methods WHERE user_id = ? AND account_number = ? FOR UPDATE', [$user['id'], $payerAccountInput]);
            if (!$pm) {
                q('UPDATE passenger_payment_methods SET is_default = 0 WHERE user_id = ?', [$user['id']]);
                q('INSERT INTO passenger_payment_methods (user_id, provider, account_number, account_holder, balance, currency_code, is_default)
                   VALUES (?, ?, ?, ?, ?, ?, 1)',
                    [$user['id'], $provider === 'sandbox' ? 'orange_money' : $provider, $payerAccountInput, $payerHolderInput ?: 'Passager', max(500000, $amount * 2), $booking['currency_code']]);
                $pm = one('SELECT * FROM passenger_payment_methods WHERE id = ? FOR UPDATE', [(int) db()->lastInsertId()]);
            }
        }
        if (!$pm) {
            $pm = one('SELECT * FROM passenger_payment_methods WHERE user_id = ? ORDER BY is_default DESC, id DESC LIMIT 1 FOR UPDATE', [$user['id']]);
            if (!$pm) {
                $defaultAcc = $user['phone'] ?? '+237 690 00 00 00';
                q('INSERT INTO passenger_payment_methods (user_id, provider, account_number, account_holder, balance, currency_code, is_default)
                   VALUES (?, ?, ?, ?, ?, ?, 1)',
                    [$user['id'], $provider === 'sandbox' ? 'orange_money' : $provider, $defaultAcc, $payerHolderInput ?: 'Passager', max(500000, $amount * 2), $booking['currency_code']]);
                $pm = one('SELECT * FROM passenger_payment_methods WHERE id = ? FOR UPDATE', [(int) db()->lastInsertId()]);
            }
        }

        if ((int) $pm['balance'] < $amount) {
            fail(422, 'insufficient_funds', 'Solde insuffisant sur votre compte de paiement enregistré (' . $pm['account_number'] . ').');
        }

        // 1. Déduction directe sur le compte du passager
        q('UPDATE passenger_payment_methods SET balance = balance - ? WHERE id = ?', [$amount, $pm['id']]);
        $remainingBalance = (int) $pm['balance'] - $amount;

        // 2. Calcul de la part nette agence (99,5 %) et de la commission Propriétaire VELTRON (0,5 %)
        $rateBps = (int) ($booking['commission_rate_bps'] ?? 50);
        $platformFee = (int) round(($amount * $rateBps) / 10000);
        $agencyNet = max(0, $amount - $platformFee);
        $agencyPayoutLabel = ($booking['payout_method'] ?: 'orange_money') . ':' . ($booking['payout_account_number'] ?: $booking['agency_name']);

        // 3. Versement direct sur le compte enregistré de l'agence
        q('UPDATE agencies SET wallet_balance = wallet_balance + ? WHERE id = ?', [$agencyNet, $booking['agency_id']]);

        $effectiveProvider = $provider === 'sandbox' ? ($pm['provider'] ?: 'orange_money') : $provider;
        q("INSERT INTO payments (booking_id, provider, provider_ref, payer_account, agency_payout_account, idempotency_key,
                                 amount, agency_net_amount, platform_fee_amount, currency_code, status, sandbox)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'succeeded', ?)",
            [$booking['id'], $effectiveProvider, 'PAY-' . strtoupper(bin2hex(random_bytes(5))),
             $pm['account_number'], $agencyPayoutLabel, $key,
             $amount, $agencyNet, $platformFee, $booking['currency_code'], $provider === 'sandbox' ? 1 : 0]);

        q("UPDATE tickets SET status = 'valid' WHERE booking_id = ? AND status = 'held'", [$booking['id']]);
        q("UPDATE bookings SET status = 'paid', expires_at = NULL WHERE id = ?", [$booking['id']]);

        // Attribution automatique des points de fidélité annuels chez cette agence
        $year = (int) gmdate('Y');
        $pts = max(1, (int) $booking['points_per_trip']);
        $tickets = all("SELECT id FROM tickets WHERE booking_id = ? AND status = 'valid'", [$booking['id']]);
        foreach ($tickets as $tk) {
            q("INSERT IGNORE INTO loyalty_ledger (user_id, agency_id, year, points, reason, ticket_id)
               VALUES (?,?,?,?, 'trip', ?)",
                [$user['id'], $booking['agency_id'], $year, $pts, $tk['id']]);
            $pointsEarned += $pts;
        }
        // Si le bus devient plein avec cet achat, reversement automatique des 0,5 % à VELTRON
        settle_trip_commission((int) $booking['trip_id']);

        $transferDetails = [
            'payer_account' => $pm['account_number'],
            'payer_provider' => $effectiveProvider,
            'payer_remaining_balance' => $remainingBalance,
            'agency_payout_account' => $agencyPayoutLabel,
            'agency_net_amount' => $agencyNet,
            'platform_fee_amount' => $platformFee,
        ];
    });

    if ($existingStatus !== null) {
        json_out(['status' => $existingStatus, 'booking_id' => (int) $p['id']]);
    }
    $tickets = all("SELECT id FROM tickets WHERE booking_id = ? AND status = 'valid'", [(int) $p['id']]);
    json_out(array_merge([
        'status' => 'paid',
        'booking_id' => (int) $p['id'],
        'ticket_ids' => array_column($tickets, 'id'),
        'points_earned' => $pointsEarned,
        'sandbox' => $provider === 'sandbox',
    ], $transferDetails));
});

// Mes billets
route('GET', '/api/me/tickets', function () {
    $user = require_passenger();
    $rows = all("SELECT k.id, k.status, k.passenger_name, k.price, s.seat_no, b.reference, b.currency_code,
                        t.id AS trip_id, t.departs_at, t.status AS trip_status, t.delay_minutes,
                        oc.name AS origin, dc.name AS destination, oc.timezone,
                        a.id AS agency_id, a.slug, a.name AS agency_name, a.primary_color, a.refund_cutoff_minutes,
                        EXISTS(SELECT 1 FROM reviews r WHERE r.ticket_id = k.id) AS reviewed
                 FROM tickets k
                 JOIN bookings b ON b.id = k.booking_id
                 JOIN trips t ON t.id = k.trip_id
                 JOIN routes r ON r.id = t.route_id
                 JOIN cities oc ON oc.id = r.origin_city_id
                 JOIN cities dc ON dc.id = r.dest_city_id
                 JOIN seats s ON s.id = k.seat_id
                 JOIN agencies a ON a.id = t.agency_id
                 WHERE b.user_id = ? AND k.status NOT IN ('held', 'expired')
                 ORDER BY t.departs_at DESC", [$user['id']]);
    foreach ($rows as &$r) {
        $r['refund'] = refund_quote($r);
        $r['reviewed'] = (bool) $r['reviewed'];
        $r['departs_at'] = iso($r['departs_at']);
        unset($r['agency_id'], $r['refund_cutoff_minutes']);
    }
    json_out($rows);
});

// Détail d'un billet
route('GET', '/api/tickets/{id}', function (array $p) {
    $s = current_session() ?? fail(401, 'unauthenticated', 'Connexion requise.');
    $k = one("SELECT k.id, k.status, k.passenger_name, k.id_type, k.qr_token, k.price, k.checked_in_at,
                     s.seat_no, s.seat_class, b.reference, b.currency_code, b.user_id,
                     t.id AS trip_id, t.route_id, t.departs_at, t.arrives_at, t.status AS trip_status, t.delay_minutes,
                     oc.name AS origin, dc.name AS destination, oc.timezone, bus.label AS bus_label,
                     a.id AS agency_id, a.slug, a.name AS agency_name, a.primary_color, a.logo_path,
                     a.refund_cutoff_minutes, a.transfer_fee, cur.minor_units
              FROM tickets k
              JOIN bookings b ON b.id = k.booking_id
              JOIN trips t ON t.id = k.trip_id
              JOIN routes r ON r.id = t.route_id
              JOIN cities oc ON oc.id = r.origin_city_id
              JOIN cities dc ON dc.id = r.dest_city_id
              JOIN buses bus ON bus.id = t.bus_id
              JOIN seats s ON s.id = k.seat_id
              JOIN agencies a ON a.id = t.agency_id
              JOIN currencies cur ON cur.code = a.currency_code
              WHERE k.id = ?", [(int) $p['id']]) ?? fail(404, 'not_found', 'Billet introuvable.');

    if ($s['realm'] === 'passenger') {
        if ((int) $k['user_id'] !== (int) $s['id']) fail(403, 'forbidden', 'Accès refusé.');
    } else {
        require_staff((int) $k['agency_id']);
    }

    $k['refund'] = refund_quote($k);
    $k['luggage'] = all('SELECT tag_code, pieces, weight_kg, status FROM luggage WHERE ticket_id = ?', [$k['id']]);
    $k['drivers'] = all('SELECT u.first_name, IF(d.photo_consent = 1, d.photo_path, NULL) AS photo_path
                         FROM trip_drivers td JOIN drivers d ON d.id = td.driver_id JOIN users u ON u.id = d.user_id
                         WHERE td.trip_id = ? ORDER BY td.position', [$k['trip_id']]);

    // Prochains départs disponibles sur la même ligne si le passager souhaite reporter son voyage
    $k['postpone_options'] = [];
    if ($k['status'] === 'valid' && $k['refund']['minutes_before'] >= (int) $k['refund_cutoff_minutes']) {
        $opts = all("SELECT t.id, t.departs_at, b.label AS bus_label,
                            b.seat_count - (SELECT COUNT(*) FROM tickets tk WHERE tk.trip_id = t.id AND tk.active_seat_id IS NOT NULL) AS free_seats
                     FROM trips t JOIN buses b ON b.id = t.bus_id
                     WHERE t.agency_id = ? AND t.route_id = ? AND t.id <> ? AND t.status = 'scheduled'
                       AND t.departs_at > UTC_TIMESTAMP() AND t.price <= ?
                     ORDER BY t.departs_at LIMIT 8",
            [$k['agency_id'], $k['route_id'], $k['trip_id'], $k['price']]);
        foreach ($opts as &$o) $o['departs_at'] = iso($o['departs_at']);
        $k['postpone_options'] = array_values(array_filter($opts, fn($o) => (int) $o['free_seats'] > 0));
    }

    $k['departs_at'] = iso($k['departs_at']);
    $k['arrives_at'] = iso($k['arrives_at']);
    unset($k['user_id'], $k['agency_id'], $k['refund_cutoff_minutes'], $k['route_id']);
    json_out($k);
});

// Annulation avec remboursement (refusée à moins de 2 h)
route('POST', '/api/tickets/{id}/refund', function (array $p) {
    $user = require_passenger();
    $quote = transaction(function () use ($p, $user) {
        $k = one("SELECT k.id, k.status, k.price, k.booking_id, b.user_id, t.departs_at, a.id AS agency_id,
                         a.refund_cutoff_minutes
                  FROM tickets k
                  JOIN bookings b ON b.id = k.booking_id
                  JOIN trips t ON t.id = k.trip_id
                  JOIN agencies a ON a.id = t.agency_id
                  WHERE k.id = ? FOR UPDATE", [(int) $p['id']]);
        if (!$k || (int) $k['user_id'] !== (int) $user['id']) fail(404, 'not_found', 'Billet introuvable.');

        $quote = refund_quote($k);
        if (!$quote['allowed']) {
            fail(422, 'refund_closed', 'Remboursement impossible : le délai avant le départ est dépassé.');
        }

        q("UPDATE tickets SET status = 'refunded' WHERE id = ?", [$k['id']]);
        // Retrait des points de fidélité gagnés sur ce billet s'il y en a eu
        $ptsRow = one('SELECT points FROM loyalty_ledger WHERE ticket_id = ? AND reason = "trip"', [$k['id']]);
        if ($ptsRow) {
            q('INSERT INTO loyalty_ledger (user_id, agency_id, year, points, reason) VALUES (?,?,?,?, "adjust")',
                [$user['id'], $k['agency_id'], (int) gmdate('Y'), -abs((int) $ptsRow['points'])]);
        }

        $payment = one("SELECT id FROM payments WHERE booking_id = ? AND status = 'succeeded' ORDER BY id DESC LIMIT 1", [$k['booking_id']]);
        if ($payment) {
            q("INSERT INTO refunds (payment_id, ticket_id, amount, reason, status) VALUES (?,?,?, 'passenger_request', 'approved')",
                [$payment['id'], $k['id'], $quote['amount']]);
        }
        $left = one("SELECT COUNT(*) AS n FROM tickets WHERE booking_id = ? AND status IN ('valid','boarded')", [$k['booking_id']]);
        if ((int) $left['n'] === 0) q("UPDATE bookings SET status = 'refunded' WHERE id = ?", [$k['booking_id']]);

        audit((int) $user['id'], (int) $k['agency_id'], 'refund.approve', 'ticket', (int) $k['id'], $quote);
        return $quote;
    });
    json_out(['refunded' => true, 'amount' => $quote['amount'], 'percent' => $quote['percent'], 'sandbox' => true]);
});

// Report de billet par le passager vers un autre départ de la même ligne (avant le délai de coupure)
route('POST', '/api/tickets/{id}/postpone', function (array $p) {
    $user = require_passenger();
    $toTripId = (int) (input()['to_trip_id'] ?? 0);

    $newId = transaction(function () use ($p, $user, $toTripId) {
        $old = one("SELECT k.*, b.user_id, t.agency_id, t.route_id, t.departs_at, a.refund_cutoff_minutes, a.transfer_fee
                    FROM tickets k JOIN bookings b ON b.id = k.booking_id
                    JOIN trips t ON t.id = k.trip_id JOIN agencies a ON a.id = t.agency_id
                    WHERE k.id = ? FOR UPDATE", [(int) $p['id']]);
        if (!$old || (int) $old['user_id'] !== (int) $user['id']) fail(404, 'not_found', 'Billet introuvable.');
        if ($old['status'] !== 'valid') fail(409, 'bad_state', 'Seul un billet valide peut être reporté.');

        $minutesBefore = (int) floor((strtotime($old['departs_at'] . ' UTC') - time()) / 60);
        if ($minutesBefore < (int) $old['refund_cutoff_minutes']) {
            fail(422, 'cutoff_passed', 'Report impossible : moins de ' . round($old['refund_cutoff_minutes'] / 60) . ' h avant le départ.');
        }

        $target = one("SELECT id, agency_id, route_id, bus_id, price FROM trips
                       WHERE id = ? AND status = 'scheduled' AND departs_at > UTC_TIMESTAMP() FOR UPDATE", [$toTripId])
            ?? fail(404, 'trip_unavailable', 'Départ cible indisponible.');
        if ((int) $target['agency_id'] !== (int) $old['agency_id'] || (int) $target['route_id'] !== (int) $old['route_id']) {
            fail(422, 'wrong_route', 'Le report doit rester sur la même ligne et la même agence.');
        }

        $seat = one("SELECT s.id FROM seats s
                     WHERE s.bus_id = ? AND s.seat_class = 'standard'
                       AND NOT EXISTS (SELECT 1 FROM tickets tk WHERE tk.trip_id = ? AND tk.seat_id = s.id AND tk.active_seat_id IS NOT NULL)
                     ORDER BY s.seat_no LIMIT 1", [$target['bus_id'], $target['id']])
            ?? fail(409, 'bus_full', 'Plus de siège disponible sur ce départ.');

        q("INSERT INTO tickets (booking_id, trip_id, seat_id, passenger_name, id_type, id_number, phone, qr_token, status, price)
           VALUES (?,?,?,?,?,?,?,?, 'valid', ?)",
            [$old['booking_id'], $target['id'], $seat['id'], $old['passenger_name'], $old['id_type'],
             $old['id_number'], $old['phone'], new_qr_token(), $old['price']]);
        $newId = (int) db()->lastInsertId();

        q("UPDATE tickets SET status = 'transferred' WHERE id = ?", [$old['id']]);
        q("INSERT INTO ticket_transfers (old_ticket_id, new_ticket_id, from_trip_id, to_trip_id, kind, fee, passenger_consent, done_by)
           VALUES (?,?,?,?, 'postpone', ?, 1, ?)",
            [$old['id'], $newId, $old['trip_id'], $target['id'], (int) $old['transfer_fee'], $user['id']]);
        audit((int) $user['id'], (int) $old['agency_id'], 'ticket.postpone', 'ticket', (int) $old['id'], ['new_ticket_id' => $newId]);
        return $newId;
    });

    json_out(['postponed' => true, 'new_ticket_id' => $newId]);
});

// Avis vérifié
route('POST', '/api/tickets/{id}/review', function (array $p) {
    $user = require_passenger();
    $in = input();
    $k = one("SELECT k.id, k.status, b.user_id, t.id AS trip_id, t.status AS trip_status, t.bus_id, t.agency_id
              FROM tickets k JOIN bookings b ON b.id = k.booking_id JOIN trips t ON t.id = k.trip_id
              WHERE k.id = ?", [(int) $p['id']]);
    if (!$k || (int) $k['user_id'] !== (int) $user['id']) fail(404, 'not_found', 'Billet introuvable.');
    if ($k['status'] !== 'boarded' && $k['trip_status'] !== 'completed') {
        fail(422, 'not_eligible', 'Vous pourrez donner votre avis après le voyage.');
    }
    if (one('SELECT id FROM reviews WHERE ticket_id = ?', [$k['id']])) fail(409, 'already_reviewed', 'Avis déjà envoyé.');

    $ratings = [];
    foreach (['rating_agency', 'rating_bus', 'rating_trip'] as $field) {
        $v = (int) ($in[$field] ?? 0);
        if ($v < 1 || $v > 5) fail(422, 'invalid_rating', 'Chaque note doit être comprise entre 1 et 5.');
        $ratings[] = $v;
    }
    q("INSERT INTO reviews (ticket_id, user_id, agency_id, trip_id, bus_id, rating_agency, rating_bus, rating_trip, comment, status)
       VALUES (?,?,?,?,?,?,?,?,?, 'published')",
        [$k['id'], $user['id'], $k['agency_id'], $k['trip_id'], $k['bus_id'], ...$ratings,
         str_in($in['comment'] ?? '', 1000) ?: null]);
    json_out(['saved' => true], 201);
});

// =============================================================================
// PROGRAMME FIDÉLITÉ ANNUEL PAR AGENCE (remise à zéro chaque 1er janvier)
// =============================================================================
route('GET', '/api/me/loyalty', function () {
    $user = require_passenger();
    $year = (int) gmdate('Y');

    $agencies = all("SELECT a.id, a.slug, a.name, a.primary_color, a.points_per_trip,
                            COALESCE(SUM(CASE WHEN l.year = ? THEN l.points ELSE 0 END), 0) AS balance,
                            COUNT(DISTINCT CASE WHEN l.year = ? AND l.reason = 'trip' THEN l.id END) AS trips_this_year
                     FROM agencies a
                     LEFT JOIN loyalty_ledger l ON l.agency_id = a.id AND l.user_id = ?
                     WHERE a.status = 'active'
                     GROUP BY a.id
                     ORDER BY balance DESC, a.name ASC", [$year, $year, $user['id']]);

    foreach ($agencies as &$a) {
        $a['id'] = (int) $a['id'];
        $a['balance'] = max(0, (int) $a['balance']);
        $a['trips_this_year'] = (int) $a['trips_this_year'];
        $a['points_per_trip'] = (int) $a['points_per_trip'];
        $a['rewards'] = all('SELECT id, title, description, points_required FROM loyalty_rewards
                             WHERE agency_id = ? AND active = 1 ORDER BY points_required ASC', [$a['id']]);
    }

    $vouchers = all("SELECT lr.id, lr.code, lr.status, lr.created_at, rw.title, rw.points_required, a.name AS agency_name, a.primary_color
                     FROM loyalty_redemptions lr
                     JOIN loyalty_rewards rw ON rw.id = lr.reward_id
                     JOIN agencies a ON a.id = lr.agency_id
                     WHERE lr.user_id = ? ORDER BY lr.id DESC LIMIT 20", [$user['id']]);
    foreach ($vouchers as &$v) $v['created_at'] = iso($v['created_at']);

    json_out([
        'year' => $year,
        'reset_date' => "$year-12-31",
        'agencies' => $agencies,
        'vouchers' => $vouchers,
    ]);
});

route('POST', '/api/me/loyalty/redeem', function () {
    $user = require_passenger();
    $rewardId = (int) (input()['reward_id'] ?? 0);
    $year = (int) gmdate('Y');

    $voucher = transaction(function () use ($user, $rewardId, $year) {
        $rw = one('SELECT r.*, a.name AS agency_name FROM loyalty_rewards r JOIN agencies a ON a.id = r.agency_id
                   WHERE r.id = ? AND r.active = 1 FOR UPDATE', [$rewardId])
            ?? fail(404, 'not_found', 'Récompense introuvable.');

        $bal = (int) (one('SELECT COALESCE(SUM(points), 0) AS pts FROM loyalty_ledger
                           WHERE user_id = ? AND agency_id = ? AND year = ?',
            [$user['id'], $rw['agency_id'], $year])['pts'] ?? 0);

        if ($bal < (int) $rw['points_required']) {
            fail(422, 'insufficient_points', 'Solde de points insuffisant pour cette année.');
        }

        $code = 'RWD-' . random_code(6);
        q("INSERT INTO loyalty_ledger (user_id, agency_id, year, points, reason) VALUES (?,?,?,?, 'redeem')",
            [$user['id'], $rw['agency_id'], $year, -((int) $rw['points_required'])]);
        q("INSERT INTO loyalty_redemptions (user_id, agency_id, reward_id, code) VALUES (?,?,?,?)",
            [$user['id'], $rw['agency_id'], $rw['id'], $code]);

        return ['code' => $code, 'title' => $rw['title'], 'agency_name' => $rw['agency_name']];
    });

    json_out($voucher, 201);
});
