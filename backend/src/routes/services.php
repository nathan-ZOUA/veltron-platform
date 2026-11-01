<?php
declare(strict_types=1);

// =============================================================================
// Services Passager : Location de bus (devis) et Achat de bus (annonces).
// =============================================================================

route('POST', '/api/rentals', function () {
    rate_limit('rental:ip:' . client_ip(), 10, 600);
    $s = current_session();
    $userId = ($s && $s['realm'] === 'passenger') ? (int) $s['id'] : null;

    $in = input();
    $countryId = (int) ($in['country_id'] ?? 0);
    $agencyId = !empty($in['agency_id']) ? (int) $in['agency_id'] : null;
    $departure = str_in($in['departure'] ?? '', 120);
    $destination = str_in($in['destination'] ?? '', 120);
    $startDate = trim((string) ($in['start_date'] ?? ''));
    $endDate = trim((string) ($in['end_date'] ?? ''));
    $passengers = max(1, min(500, (int) ($in['passengers'] ?? 30)));
    $busType = in_array($in['bus_type'] ?? '', ['standard', 'vip', 'minibus', 'coach'], true) ? $in['bus_type'] : 'coach';
    $withDriver = !isset($in['with_driver']) || (bool) $in['with_driver'] ? 1 : 0;
    $name = str_in($in['contact_name'] ?? '', 120);
    $email = strtolower(trim((string) ($in['contact_email'] ?? '')));
    $phone = str_in($in['contact_phone'] ?? '', 25);
    $notes = str_in($in['notes'] ?? '', 1000) ?: null;

    if (!one('SELECT id FROM countries WHERE id = ?', [$countryId])) fail(422, 'invalid_country', 'Choisissez un pays.');
    if ($departure === '' || $destination === '') fail(422, 'invalid_route', 'Indiquez le lieu de départ et la destination.');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate) || $endDate < $startDate) {
        fail(422, 'invalid_dates', 'Dates de location invalides.');
    }
    if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || $phone === '') {
        fail(422, 'invalid_contact', 'Nom, e-mail et téléphone sont obligatoires.');
    }

    $ref = 'LOC-' . random_code(6);
    q('INSERT INTO rental_requests (reference, user_id, agency_id, country_id, departure, destination, start_date, end_date,
                                    passengers, bus_type, with_driver, contact_name, contact_email, contact_phone, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [$ref, $userId, $agencyId, $countryId, $departure, $destination, $startDate, $endDate,
         $passengers, $busType, $withDriver, $name, $email, $phone, $notes]);

    json_out(['reference' => $ref, 'status' => 'new'], 201);
});

route('GET', '/api/me/rentals', function () {
    $u = require_passenger();
    $rows = all("SELECT rr.id, rr.reference, rr.departure, rr.destination, rr.start_date, rr.end_date,
                        rr.passengers, rr.bus_type, rr.with_driver, rr.status, rr.quote_amount, rr.agency_reply,
                        rr.created_at, COALESCE(a.name, qa.name) AS agency_name,
                        COALESCE(a.currency_code, qa.currency_code, c.default_currency) AS currency_code
                 FROM rental_requests rr
                 JOIN countries c ON c.id = rr.country_id
                 LEFT JOIN agencies a ON a.id = rr.agency_id
                 LEFT JOIN agencies qa ON qa.id = rr.answered_by_agency
                 WHERE rr.user_id = ? OR rr.contact_email = ?
                 ORDER BY rr.id DESC LIMIT 30", [$u['id'], $u['email']]);
    foreach ($rows as &$r) $r['created_at'] = iso($r['created_at']);
    json_out($rows);
});

// Annonces de vente de bus
route('GET', '/api/bus-listings', function () {
    $rows = all("SELECT bl.id, bl.title, bl.brand, bl.model, bl.year, bl.seats, bl.mileage_km,
                        bl.price, bl.currency_code, bl.description, bl.photo_path, bl.created_at,
                        a.name AS agency_name, a.slug AS agency_slug, a.primary_color,
                        c.name_fr AS country_name, c.iso2 AS country, cur.minor_units
                 FROM bus_listings bl
                 JOIN agencies a ON a.id = bl.agency_id AND a.status = 'active'
                 JOIN countries c ON c.id = a.country_id
                 JOIN currencies cur ON cur.code = bl.currency_code
                 WHERE bl.status = 'active'
                 ORDER BY bl.created_at DESC LIMIT 50");
    foreach ($rows as &$r) $r['created_at'] = iso($r['created_at']);
    json_out($rows);
});

route('POST', '/api/bus-listings/{id}/inquire', function (array $p) {
    rate_limit('bus_inq:ip:' . client_ip(), 10, 600);
    $listing = one("SELECT id FROM bus_listings WHERE id = ? AND status = 'active'", [(int) $p['id']])
        ?? fail(404, 'not_found', 'Annonce introuvable.');
    $s = current_session();
    $userId = ($s && $s['realm'] === 'passenger') ? (int) $s['id'] : null;

    $in = input();
    $name = str_in($in['name'] ?? '', 120);
    $email = strtolower(trim((string) ($in['email'] ?? '')));
    $phone = str_in($in['phone'] ?? '', 25) ?: null;
    $msg = str_in($in['message'] ?? '', 1000);
    if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL) || $msg === '') {
        fail(422, 'invalid_fields', 'Nom, e-mail et message sont obligatoires.');
    }

    q('INSERT INTO bus_inquiries (listing_id, user_id, name, email, phone, message) VALUES (?,?,?,?,?,?)',
        [$listing['id'], $userId, $name, $email, $phone, $msg]);
    json_out(['sent' => true], 201);
});

