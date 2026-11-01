<?php
declare(strict_types=1);

// =============================================================================
// Catalogue public & Suivi de trajet en temps réel avec estimation dynamique (ETA).
// =============================================================================

route('GET', '/api/health', fn() => json_out(['ok' => true, 'version' => '2.0']));

route('GET', '/api/countries', function () {
    $lang = strtolower((string) ($_GET['lang'] ?? 'fr'));
    $orderCol = $lang === 'en' ? 'name_en' : 'name_fr';
    $rows = all("SELECT c.id, c.iso2, c.name_fr, c.name_en, c.default_currency, c.phone_prefix,
                        cur.name AS currency_name, cur.symbol AS currency_symbol, cur.minor_units
                 FROM countries c JOIN currencies cur ON cur.code = c.default_currency
                 ORDER BY c.$orderCol ASC");
    json_out($rows);
});

route('GET', '/api/cities', function () {
    $countryId = (int) ($_GET['country_id'] ?? 0);
    json_out(all('SELECT id, country_id, name, timezone, lat, lng FROM cities
                  WHERE (? = 0 OR country_id = ?) ORDER BY name', [$countryId, $countryId]));
});

route('GET', '/api/currencies', fn() => json_out(all('SELECT code, name, symbol, minor_units FROM currencies ORDER BY code ASC')));

// Annuaire des agences actives (filtre optionnel : ?country=CM)
route('GET', '/api/agencies', function () {
    $iso = strtoupper(substr(trim((string) ($_GET['country'] ?? '')), 0, 2));
    json_out(all("SELECT a.id, a.slug, a.name, a.primary_color, a.logo_path, a.cover_path,
                         a.currency_code, a.city_name, a.points_per_trip, c.iso2 AS country, c.name_fr AS country_name,
                         (SELECT ROUND(AVG(r.rating_agency), 1) FROM reviews r
                           WHERE r.agency_id = a.id AND r.status = 'published') AS rating,
                         (SELECT COUNT(*) FROM reviews r
                           WHERE r.agency_id = a.id AND r.status = 'published') AS reviews_count,
                         (SELECT COUNT(*) FROM trips t
                           WHERE t.agency_id = a.id AND t.status = 'scheduled' AND t.departs_at > UTC_TIMESTAMP()) AS upcoming_trips
                  FROM agencies a JOIN countries c ON c.id = a.country_id
                  WHERE a.status = 'active' AND (? = '' OR c.iso2 = ?)
                  ORDER BY a.name", [$iso, $iso]));
});

// Fiche publique d'une agence
route('GET', '/api/agencies/{slug}', function (array $p) {
    $agency = one("SELECT a.id, a.slug, a.name, a.primary_color, a.logo_path, a.cover_path,
                          a.currency_code, a.email, a.phone, a.address, a.refund_cutoff_minutes,
                          a.free_baggage_kg, a.baggage_fee_per_kg, a.points_per_trip,
                          c.iso2 AS country, cur.minor_units
                   FROM agencies a
                   JOIN countries c ON c.id = a.country_id
                   JOIN currencies cur ON cur.code = a.currency_code
                   WHERE a.slug = ? AND a.status = 'active'", [$p['slug']])
        ?? fail(404, 'not_found', 'Agence introuvable.');

    $agency['routes'] = all('SELECT r.id, oc.name AS origin, dc.name AS destination, r.distance_km, r.duration_min
                             FROM routes r
                             JOIN cities oc ON oc.id = r.origin_city_id
                             JOIN cities dc ON dc.id = r.dest_city_id
                             WHERE r.agency_id = ? ORDER BY oc.name, dc.name', [$agency['id']]);
    $agency['refund_tiers'] = all('SELECT min_minutes_before, refund_percent FROM refund_tiers
                                   WHERE agency_id = ? ORDER BY min_minutes_before DESC', [$agency['id']]);
    $agency['rewards'] = all('SELECT id, title, description, points_required FROM loyalty_rewards
                              WHERE agency_id = ? AND active = 1 ORDER BY points_required ASC', [$agency['id']]);
    unset($agency['id']);
    json_out($agency);
});

// Départs à venir d'une agence
route('GET', '/api/agencies/{slug}/trips', function (array $p) {
    expire_holds();
    $agency = one("SELECT id FROM agencies WHERE slug = ? AND status = 'active'", [$p['slug']])
        ?? fail(404, 'not_found', 'Agence introuvable.');
    $routeId = (int) ($_GET['route_id'] ?? 0);

    $trips = all("SELECT t.id, t.route_id, t.departs_at, t.arrives_at, t.price, t.vip_price, t.delay_minutes,
                         oc.name AS origin, dc.name AS destination, oc.timezone, r.distance_km,
                         b.label AS bus_label, b.bus_type, b.seat_count,
                         b.seat_count - (SELECT COUNT(*) FROM tickets k
                                          WHERE k.trip_id = t.id AND k.active_seat_id IS NOT NULL) AS free_seats
                  FROM trips t
                  JOIN routes r ON r.id = t.route_id
                  JOIN cities oc ON oc.id = r.origin_city_id
                  JOIN cities dc ON dc.id = r.dest_city_id
                  JOIN buses b ON b.id = t.bus_id
                  WHERE t.agency_id = ? AND t.status IN ('scheduled','boarding') AND t.departs_at > UTC_TIMESTAMP()
                    AND (? = 0 OR t.route_id = ?)
                  ORDER BY t.departs_at LIMIT 60", [$agency['id'], $routeId, $routeId]);

    foreach ($trips as &$t) {
        $t['departs_at'] = iso($t['departs_at']);
        $t['arrives_at'] = iso($t['arrives_at']);
        $t['drivers'] = all('SELECT u.first_name, IF(d.photo_consent = 1, d.photo_path, NULL) AS photo_path,
                                    d.licence_verified
                             FROM trip_drivers td
                             JOIN drivers d ON d.id = td.driver_id
                             JOIN users u ON u.id = d.user_id
                             WHERE td.trip_id = ? ORDER BY td.position', [$t['id']]);
    }
    json_out($trips);
});

// Détail d'un départ + plan des sièges
route('GET', '/api/trips/{id}', function (array $p) {
    expire_holds();
    $trip = one("SELECT t.id, t.departs_at, t.arrives_at, t.price, t.vip_price, t.status, t.delay_minutes,
                        t.bus_id, b.label AS bus_label, b.bus_type, b.layout,
                        oc.name AS origin, dc.name AS destination, oc.timezone,
                        a.slug AS agency_slug, a.name AS agency_name, a.primary_color, a.points_per_trip,
                        a.currency_code, cur.minor_units, a.refund_cutoff_minutes
                 FROM trips t
                 JOIN routes r ON r.id = t.route_id
                 JOIN cities oc ON oc.id = r.origin_city_id
                 JOIN cities dc ON dc.id = r.dest_city_id
                 JOIN buses b ON b.id = t.bus_id
                 JOIN agencies a ON a.id = t.agency_id
                 JOIN currencies cur ON cur.code = a.currency_code
                 WHERE t.id = ?", [(int) $p['id']]) ?? fail(404, 'not_found', 'Départ introuvable.');

    $trip['seats'] = all('SELECT s.id, s.seat_no, s.row_no, s.col_no, s.seat_class,
                                 (k.id IS NOT NULL) AS taken
                          FROM seats s
                          LEFT JOIN tickets k ON k.seat_id = s.id AND k.trip_id = ? AND k.active_seat_id IS NOT NULL
                          WHERE s.bus_id = ? ORDER BY s.seat_no', [$trip['id'], $trip['bus_id']]);
    foreach ($trip['seats'] as &$s) $s['taken'] = (bool) $s['taken'];
    $trip['layout'] = json_decode($trip['layout'], true);
    $trip['departs_at'] = iso($trip['departs_at']);
    $trip['arrives_at'] = iso($trip['arrives_at']);
    unset($trip['bus_id']);
    json_out($trip);
});

route('GET', '/api/agencies/{slug}/reviews', function (array $p) {
    json_out(all("SELECT r.rating_agency, r.rating_bus, r.rating_trip, r.comment, r.agency_reply,
                         r.created_at, u.first_name
                  FROM reviews r
                  JOIN agencies a ON a.id = r.agency_id
                  JOIN users u ON u.id = r.user_id
                  WHERE a.slug = ? AND r.status = 'published'
                  ORDER BY r.created_at DESC LIMIT 30", [$p['slug']]));
});

// =============================================================================
// SUIVI DE TRAJET EN TEMPS RÉEL (Vitesse km/h + Bouchons / Pannes + ETA dynamique)
// =============================================================================

function build_tracking_payload(int $tripId, ?string $reference = null): array
{
    $t = one("SELECT t.id, t.status, t.departs_at, t.arrives_at, t.actual_departed_at, t.actual_arrived_at,
                     t.delay_minutes, t.postponed_from,
                     r.distance_km, r.duration_min,
                     oc.name AS origin, oc.timezone, oc.lat AS origin_lat, oc.lng AS origin_lng,
                     dc.name AS destination, dc.lat AS dest_lat, dc.lng AS dest_lng,
                     b.label AS bus_label, b.plate, b.avg_speed_kmh, b.has_gps, b.gps_device_id,
                     a.name AS agency_name, a.slug AS agency_slug, a.primary_color
              FROM trips t
              JOIN routes r ON r.id = t.route_id
              JOIN cities oc ON oc.id = r.origin_city_id
              JOIN cities dc ON dc.id = r.dest_city_id
              JOIN buses b ON b.id = t.bus_id
              JOIN agencies a ON a.id = t.agency_id
              WHERE t.id = ?", [$tripId]) ?? fail(404, 'not_found', 'Trajet introuvable.');

    $updates = all("SELECT u.id, u.kind, u.cause, u.delay_minutes, u.lat, u.lng, u.speed_kmh, u.progress_pct,
                           u.note, u.created_at, usr.first_name AS author
                    FROM trip_status_updates u
                    JOIN users usr ON usr.id = u.user_id
                    WHERE u.trip_id = ?
                    ORDER BY u.id DESC LIMIT 30", [$tripId]);

    $distanceKm = max(20, (int) ($t['distance_km'] ?: 240));
    $avgSpeed = max(30, (int) ($t['avg_speed_kmh'] ?: 70));
    $delayMinutes = (int) $t['delay_minutes'];

    // Dernière vitesse, progression et coordonnées GPS signalées par le chauffeur / traceur
    $latestSpeed = null;
    $latestProgress = null;
    $latestLat = null;
    $latestLng = null;
    $activeCause = null;
    foreach ($updates as &$up) {
        $up['lat'] = $up['lat'] !== null ? (float) $up['lat'] : null;
        $up['lng'] = $up['lng'] !== null ? (float) $up['lng'] : null;
        if ($latestSpeed === null && $up['speed_kmh'] !== null) $latestSpeed = (int) $up['speed_kmh'];
        if ($latestProgress === null && $up['progress_pct'] !== null) $latestProgress = (int) $up['progress_pct'];
        if ($latestLat === null && $up['lat'] !== null && $up['lng'] !== null) {
            $latestLat = $up['lat'];
            $latestLng = $up['lng'];
        }
        if ($activeCause === null && in_array($up['kind'], ['delay', 'prolonged_stop', 'deviation', 'breakdown', 'resumed'], true)) {
            $activeCause = $up['kind'] === 'resumed' ? null : ($up['cause'] ?: $up['kind']);
        }
    }
    unset($up);

    // Progression estimée si aucun pourcentage récent n'a été saisi
    if ($t['status'] === 'completed') {
        $progressPct = 100;
        $speedKmh = 0;
    } elseif ($t['status'] === 'departed') {
        $startTs = strtotime(($t['actual_departed_at'] ?: $t['departs_at']) . ' UTC');
        $elapsedH = max(0.0, (time() - $startTs) / 3600);
        $autoPct = (int) min(95, round(($elapsedH * $avgSpeed / $distanceKm) * 100));
        $progressPct = $latestProgress !== null ? max($latestProgress, min(95, $autoPct)) : $autoPct;
        $speedKmh = $latestSpeed ?? $avgSpeed;
    } else {
        $progressPct = 0;
        $speedKmh = 0;
    }

    $remainingKm = (int) max(0, round($distanceKm * (100 - $progressPct) / 100));

    // Coordonnées interpolées si le bus est en mode manuel sans point GPS récent
    $origLat = $t['origin_lat'] !== null ? (float) $t['origin_lat'] : null;
    $origLng = $t['origin_lng'] !== null ? (float) $t['origin_lng'] : null;
    $destLat = $t['dest_lat'] !== null ? (float) $t['dest_lat'] : null;
    $destLng = $t['dest_lng'] !== null ? (float) $t['dest_lng'] : null;
    if ($latestLat === null && $origLat !== null && $destLat !== null && $origLng !== null && $destLng !== null) {
        $ratio = $progressPct / 100.0;
        $latestLat = round($origLat + ($destLat - $origLat) * $ratio, 6);
        $latestLng = round($origLng + ($destLng - $origLng) * $ratio, 6);
    }

    // Calcul dynamique de l'heure d'arrivée estimée (ETA) :
    // temps restant selon la vitesse réelle en km/h (ou vitesse moyenne si arrêt momentané) + retards déclarés non encore absorbés
    $effectiveSpeed = ($speedKmh >= 15) ? $speedKmh : max(25, (int) round($avgSpeed * 0.6));
    $driveMinutesLeft = $t['status'] === 'completed' ? 0 : (int) round(($remainingKm / $effectiveSpeed) * 60);

    if ($t['status'] === 'departed') {
        // Pénalité supplémentaire si bouchon, arrêt prolongé, déviation ou panne toujours en cours
        $incidentExtra = match ($activeCause) {
            'breakdown'      => 30,
            'prolonged_stop' => 15,
            'deviation'      => 18,
            'traffic'        => 12,
            'accident'       => 20,
            'weather'        => 10,
            default          => 0,
        };
        $etaUtc = gmdate('Y-m-d H:i:s', time() + ($driveMinutesLeft + $incidentExtra) * 60);
    } elseif ($t['status'] === 'completed') {
        $etaUtc = $t['actual_arrived_at'] ?: $t['arrives_at'];
    } else {
        $baseArrive = $t['arrives_at']
            ? strtotime($t['arrives_at'] . ' UTC')
            : (strtotime($t['departs_at'] . ' UTC') + (int) round(($distanceKm / $avgSpeed) * 3600));
        $etaUtc = gmdate('Y-m-d H:i:s', $baseArrive + $delayMinutes * 60);
    }

    foreach ($updates as &$u) $u['created_at'] = iso($u['created_at']);

    $drivers = all('SELECT u.first_name, IF(d.photo_consent = 1, d.photo_path, NULL) AS photo_path, d.availability
                    FROM trip_drivers td JOIN drivers d ON d.id = td.driver_id JOIN users u ON u.id = d.user_id
                    WHERE td.trip_id = ? ORDER BY td.position', [$tripId]);

    return [
        'trip_id' => (int) $t['id'],
        'reference' => $reference,
        'agency_name' => $t['agency_name'],
        'agency_slug' => $t['agency_slug'],
        'primary_color' => $t['primary_color'],
        'origin' => $t['origin'],
        'destination' => $t['destination'],
        'origin_lat' => $origLat,
        'origin_lng' => $origLng,
        'dest_lat' => $destLat,
        'dest_lng' => $destLng,
        'current_lat' => $latestLat,
        'current_lng' => $latestLng,
        'timezone' => $t['timezone'],
        'bus_label' => $t['bus_label'],
        'plate' => $t['plate'],
        'has_gps' => (bool) ($t['has_gps'] ?? false),
        'gps_device_id' => $t['gps_device_id'] ?? null,
        'tracking_mode' => !empty($t['has_gps']) ? 'gps' : 'manual',
        'status' => $t['status'],
        'departs_at' => iso($t['departs_at']),
        'scheduled_arrives_at' => iso($t['arrives_at']),
        'estimated_arrives_at' => iso($etaUtc),
        'postponed_from' => iso($t['postponed_from']),
        'distance_km' => $distanceKm,
        'remaining_km' => $remainingKm,
        'progress_pct' => $progressPct,
        'speed_kmh' => $speedKmh,
        'avg_speed_kmh' => $avgSpeed,
        'delay_minutes' => $delayMinutes,
        'active_cause' => $activeCause,
        'drivers' => $drivers,
        'updates' => $updates,
    ];
}

// Liste des trajets en cours + historique GPS + recherche par N° de réservation (?reference=VLT-9TRK42)
route('GET', '/api/tracking/live', function () {
    $mapsConfig = [
        'provider' => env('MAPS_PROVIDER', 'none'),
        'google_maps_api_key' => env('GOOGLE_MAPS_API_KEY', ''),
        'mapbox_access_token' => env('MAPBOX_ACCESS_TOKEN', ''),
    ];
    $ref = strtoupper(trim((string) ($_GET['reference'] ?? '')));
    if ($ref !== '') {
        $b = one('SELECT trip_id, reference FROM bookings WHERE reference = ?', [$ref])
            ?? fail(404, 'not_found', 'Aucune réservation trouvée pour la référence ' . $ref);
        json_out(['match' => build_tracking_payload((int) $b['trip_id'], $b['reference']), 'maps_config' => $mapsConfig]);
    }

    $rows = all("SELECT t.id FROM trips t JOIN agencies a ON a.id = t.agency_id
                 WHERE a.status = 'active' AND t.status IN ('departed','boarding','scheduled')
                 ORDER BY FIELD(t.status, 'departed','boarding','scheduled'), t.departs_at ASC LIMIT 8");
    $list = array_map(fn($r) => build_tracking_payload((int) $r['id']), $rows);

    $histRows = all("SELECT t.id FROM trips t JOIN agencies a ON a.id = t.agency_id
                     WHERE a.status = 'active' AND t.status = 'completed'
                     ORDER BY COALESCE(t.actual_arrived_at, t.arrives_at) DESC LIMIT 6");
    $history = array_map(fn($r) => build_tracking_payload((int) $r['id']), $histRows);

    json_out(['trips' => $list, 'history_trips' => $history, 'maps_config' => $mapsConfig]);
});

route('GET', '/api/tracking/trip/{id}', function (array $p) {
    json_out(build_tracking_payload((int) $p['id']));
});
