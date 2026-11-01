-- =============================================================================
-- VELTRON – Données de test (is_seed = 1, purgeables avant la mise en service)
-- À importer APRÈS schema.sql :  mysql -u root -p veltron < seed.sql
-- Mots de passe : définis ensuite par  php backend/bin/set_test_passwords.php
-- Les e-mails utilisent le domaine réservé ".test" (aucune vraie adresse).
-- Les heures des départs sont calculées à partir du moment de l'import.
-- =============================================================================
SET NAMES utf8mb4;
USE veltron;

-- ---------- Devises, pays, villes (le reste du monde : world_countries.sql) ----------
INSERT INTO currencies (code, name, symbol, minor_units) VALUES
  ('XAF', 'Franc CFA (CEMAC)', 'FCFA', 0),
  ('XOF', 'Franc CFA (UEMOA)', 'FCFA', 0),
  ('EUR', 'Euro', '€', 2);

INSERT INTO countries (iso2, name_fr, name_en, default_currency, phone_prefix) VALUES
  ('CM', 'Cameroun',      'Cameroon',    'XAF', '+237'),
  ('SN', 'Sénégal',       'Senegal',     'XOF', '+221'),
  ('CI', 'Côte d''Ivoire','Côte d''Ivoire', 'XOF', '+225'),
  ('FR', 'France',        'France',      'EUR', '+33');

INSERT INTO cities (country_id, name, timezone, lat, lng) VALUES
  (1, 'Douala',        'Africa/Douala',   4.051100,   9.767900),
  (1, 'Yaoundé',       'Africa/Douala',   3.848000,  11.502100),
  (1, 'Bafoussam',     'Africa/Douala',   5.473700,  10.417900),
  (1, 'Kribi',         'Africa/Douala',   2.940000,   9.910000),
  (1, 'Limbé',         'Africa/Douala',   4.024000,   9.202000),
  (1, 'Bertoua',       'Africa/Douala',   4.577200,  13.684700),
  (1, 'Garoua',        'Africa/Douala',   9.301400,  13.397700),
  (2, 'Dakar',         'Africa/Dakar',   14.716700, -17.467700),
  (2, 'Thiès',         'Africa/Dakar',   14.791000, -16.935900),
  (2, 'Saint-Louis',   'Africa/Dakar',   16.017900, -16.489600),
  (2, 'Touba',         'Africa/Dakar',   14.850000, -15.883300),
  (3, 'Abidjan',       'Africa/Abidjan',  5.360000,  -4.008300),
  (3, 'Yamoussoukro',  'Africa/Abidjan',  6.827600,  -5.289300),
  (3, 'Bouaké',        'Africa/Abidjan',  7.690600,  -5.030000),
  (4, 'Paris',         'Europe/Paris',   48.856600,   2.352200),
  (4, 'Lyon',          'Europe/Paris',   45.764000,   4.835700),
  (4, 'Marseille',     'Europe/Paris',   43.296500,   5.369800);

-- ---------- Utilisateurs de test ----------
INSERT INTO users (id, email, first_name, last_name, locale, platform_role, is_seed) VALUES
  (1,  'admin@veltron.test',            'Admin',    'VELTRON',  'fr', 'super_admin', 1),
  (2,  'owner.equateur@veltron.test',   'Marc',     'Tchoua',   'fr', 'none', 1),
  (3,  'desk.equateur@veltron.test',    'Sandrine', 'Mbarga',   'fr', 'none', 1),
  (4,  'driver1.equateur@veltron.test', 'Paul',     'Essomba',  'fr', 'none', 1),
  (5,  'driver2.equateur@veltron.test', 'Joseph',   'Nkodo',    'fr', 'none', 1),
  (6,  'owner.baobab@veltron.test',     'Ibrahima', 'Diallo',   'fr', 'none', 1),
  (7,  'desk.baobab@veltron.test',      'Awa',      'Sow',      'fr', 'none', 1),
  (8,  'driver1.baobab@veltron.test',   'Moussa',   'Ndiaye',   'fr', 'none', 1),
  (9,  'owner.rhone@veltron.test',      'Claire',   'Martin',   'fr', 'none', 1),
  (10, 'desk.rhone@veltron.test',       'Julien',   'Bernard',  'fr', 'none', 1),
  (11, 'driver1.rhone@veltron.test',    'Thomas',   'Girard',   'fr', 'none', 1),
  (12, 'passager1@veltron.test',        'Client',   'Test Un',  'fr', 'none', 1),
  (13, 'passager2@veltron.test',        'Client',   'Test Deux','en', 'none', 1),
  (14, 'prog.equateur@veltron.test',    'Brice',    'Fotso',    'fr', 'none', 1),
  (15, 'staff.equateur@veltron.test',   'Aline',    'Ngo Bassa','fr', 'none', 1),
  (16, 'compta.equateur@veltron.test',  'Hervé',    'Kamga',    'fr', 'none', 1);

-- ---------- Agences ----------
INSERT INTO agencies (id, public_code, slug, name, country_id, city_name, currency_code, primary_color, email, phone,
                      address, address_normalized, verification_status, verification_score, verified_at,
                      status, free_baggage_kg, baggage_fee_per_kg, transfer_fee, fill_window_minutes, points_per_trip,
                      commission_rate_bps, contract_accepted_at, is_seed) VALUES
  (1, 'AG-EQT001', 'equateur-voyages', 'Équateur Voyages', 1, 'Douala', 'XAF', '#8C6BB8', 'contact@equateur.test', '+237600000001',
      'Cameroun, Douala, Akwa, Boulevard de la Liberté, face Total', 'cameroundoualaakwadelalibertefacetotal',
      'approved', 92, UTC_TIMESTAMP(), 'active', 20, 100, 1000, 40, 10, 50, UTC_TIMESTAMP(), 1),
  (2, 'AG-BAO002', 'baobab-lines', 'Baobab Lines', 2, 'Dakar', 'XOF', '#3FA796', 'contact@baobab.test', '+221700000002',
      'Sénégal, Dakar, Plateau, Avenue Léopold Sédar Senghor 12', 'senegaldakarplateauleopoldsedarsenghor12',
      'approved', 88, UTC_TIMESTAMP(), 'active', 20, 100, 1000, 40, 10, 50, UTC_TIMESTAMP(), 1),
  (3, 'AG-RHO003', 'rhone-cars', 'Rhône Cars', 4, 'Lyon', 'EUR', '#D9822B', 'contact@rhone.test', '+33400000003',
      'France, Lyon, 3e arrondissement, 25 rue de la Part-Dieu', 'francelyon3earrondissement25delapartdieu',
      'approved', 95, UTC_TIMESTAMP(), 'active', 20, 100, 200, 30, 10, 50, UTC_TIMESTAMP(), 1);

-- Grille de remboursement (aucun remboursement après le délai de coupure de 2 h)
INSERT INTO refund_tiers (agency_id, min_minutes_before, refund_percent)
SELECT a.id, t.m, t.p FROM agencies a
CROSS JOIN (SELECT 1440 AS m, 100 AS p UNION ALL SELECT 360, 70 UNION ALL SELECT 120, 50) t;

-- Personnel : chaque personne a son propre compte et son propre rôle
INSERT INTO agency_staff (agency_id, user_id, role, job_title) VALUES
  (1, 2,  'owner',      'Administrateur'),
  (1, 3,  'secretary',  'Secrétaire de gare'),
  (1, 4,  'driver',     'Chauffeur'),
  (1, 5,  'driver',     'Chauffeur'),
  (1, 14, 'manager',    'Responsable programmation'),
  (1, 15, 'staff',      'Agent d''embarquement'),
  (1, 16, 'accountant', 'Comptable'),
  (2, 6,  'owner',      'Administrateur'),
  (2, 7,  'secretary',  'Secrétaire de gare'),
  (2, 8,  'driver',     'Chauffeur'),
  (3, 9,  'owner',      'Administratrice'),
  (3, 10, 'secretary',  'Secrétaire de gare'),
  (3, 11, 'driver',     'Chauffeur');

INSERT INTO drivers (id, agency_id, user_id, photo_path, photo_consent, licence_verified) VALUES
  (1, 1, 4, '/media/driver-profile.jpeg', 1, 1), (2, 1, 5, NULL, 1, 1), (3, 2, 8, NULL, 1, 1), (4, 3, 11, NULL, 1, 1);

-- ---------- Bus et sièges (2+2 et 2+3) ----------
INSERT INTO buses (id, agency_id, plate, label, bus_type, seat_count, avg_speed_kmh, layout) VALUES
  (1, 1, 'LT-001-AA', 'Coach Équateur 1', 'coach',    40, 70, '{"seats_per_row":[2,2]}'),
  (2, 1, 'LT-002-AA', 'Coach Équateur 2', 'standard', 50, 65, '{"seats_per_row":[2,3]}'),
  (3, 2, 'DK-101-BB', 'Baobab 1',         'coach',    40, 70, '{"seats_per_row":[2,2]}'),
  (4, 3, 'FR-321-CC', 'Rhône Cars 1',     'coach',    52, 90, '{"seats_per_row":[2,2]}'),
  (5, 1, 'LT-003-AA', 'Coach Équateur 3', 'vip',      40, 75, '{"seats_per_row":[2,2]}');

-- Génération des sièges à partir de la disposition (rangée / colonne)
INSERT INTO seats (bus_id, seat_no, row_no, col_no)
SELECT b.id, nums.n, (nums.n - 1) DIV b.k + 1, (nums.n - 1) MOD b.k + 1
FROM (
  SELECT id, seat_count,
         CAST(JSON_EXTRACT(layout, '$.seats_per_row[0]') AS UNSIGNED)
       + CAST(JSON_EXTRACT(layout, '$.seats_per_row[1]') AS UNSIGNED) AS k
  FROM buses
) b
JOIN (
  SELECT a.n + b2.n * 10 + 1 AS n
  FROM (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
        UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
  CROSS JOIN (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
              UNION ALL SELECT 4 UNION ALL SELECT 5) b2
) nums ON nums.n <= b.seat_count;

-- ---------- Lignes ----------
INSERT INTO routes (id, agency_id, origin_city_id, dest_city_id, distance_km, duration_min) VALUES
  (1, 1,  1,  2, 250, 240),   -- Douala → Yaoundé
  (2, 1,  2,  1, 250, 240),   -- Yaoundé → Douala
  (3, 1,  1,  3, 280, 270),   -- Douala → Bafoussam
  (4, 2,  8, 10, 265, 270),   -- Dakar → Saint-Louis
  (5, 2,  8, 11, 195, 180),   -- Dakar → Touba
  (6, 3, 15, 16, 465, 330),   -- Paris → Lyon
  (7, 3, 16, 17, 315, 210);   -- Lyon → Marseille

-- ---------- Départs (relatifs à l'heure d'import, en UTC) ----------
-- Le départ 9 est EN ROUTE (parti il y a 1 h) pour essayer le suivi en temps réel.
-- Le départ 10 part 35 min après le départ 1 (même ligne) pour essayer « compléter un bus ».
INSERT INTO trips (id, agency_id, route_id, bus_id, departs_at, arrives_at, price, vip_price, status, actual_departed_at) VALUES
  (1, 1, 1, 1, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 3 HOUR),  DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 HOUR),  5500, 8000, 'scheduled', NULL),
  (2, 1, 1, 2, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 6 HOUR),  DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 HOUR), 6000, NULL, 'scheduled', NULL),
  (3, 1, 2, 1, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 HOUR), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 14 HOUR), 5500, NULL, 'scheduled', NULL),
  (4, 1, 3, 2, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 26 HOUR), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 HOUR), 4500, NULL, 'scheduled', NULL),
  (5, 2, 4, 3, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 4 HOUR),  DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR),  4500, NULL, 'scheduled', NULL),
  (6, 2, 5, 3, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 28 HOUR), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 31 HOUR), 3500, NULL, 'scheduled', NULL),
  (7, 3, 6, 4, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR),  DATE_ADD(UTC_TIMESTAMP(), INTERVAL 14 HOUR), 2900, NULL, 'scheduled', NULL),
  (8, 3, 7, 4, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 HOUR), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 34 HOUR), 1900, NULL, 'scheduled', NULL),
  (9, 1, 2, 2, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR),  DATE_ADD(UTC_TIMESTAMP(), INTERVAL 3 HOUR),  5500, NULL, 'departed', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)),
  (10,1, 1, 5, DATE_ADD(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 3 HOUR), INTERVAL 35 MINUTE), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR), 5500, NULL, 'scheduled', NULL);

INSERT INTO trip_drivers (trip_id, driver_id, position) VALUES
  (1, 1, 1), (2, 2, 1), (3, 1, 1), (4, 2, 1),
  (5, 3, 1), (6, 3, 1), (7, 4, 1), (8, 4, 1), (9, 1, 1), (10, 2, 1);

-- Le chauffeur du départ 9 a déjà envoyé quelques nouvelles (suivi temps réel)
INSERT INTO trip_status_updates (trip_id, user_id, kind, cause, delay_minutes, lat, lng, speed_kmh, progress_pct, note, created_at) VALUES
  (9, 4, 'departed', NULL, NULL, 3.848000, 11.502100, 0, 0, 'Départ de Yaoundé', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 MINUTE)),
  (9, 4, 'delay', 'traffic', 15, 3.900000, 11.200000, 25, 12, 'Bouchon à la sortie de Yaoundé', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 40 MINUTE)),
  (9, 4, 'position', NULL, NULL, 3.950000, 10.800000, 72, 24, NULL, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 MINUTE));
UPDATE trips SET delay_minutes = 15 WHERE id = 9;

-- ---------- Réservations de test (appel, bagages, transfert, suivi) ----------
INSERT INTO bookings (id, reference, agency_id, trip_id, user_id, channel, status, total, currency_code) VALUES
  (1, 'VLT-7K2M9Q', 1, 1, 12, 'online', 'paid', 11000, 'XAF'),
  (2, 'VLT-3F8D1A', 1, 2, 13, 'online', 'paid',  6000, 'XAF'),
  (3, 'VLT-9TRK42', 1, 9, 12, 'online', 'paid',  5500, 'XAF'),
  (4, 'VLT-5FIL10', 1, 10, 13, 'online', 'paid', 5500, 'XAF');

INSERT INTO tickets (id, booking_id, trip_id, seat_id, passenger_name, id_type, id_number, qr_token, status, price, boarded_at) VALUES
  (1, 1, 1, (SELECT id FROM seats WHERE bus_id = 1 AND seat_no = 1), 'Client Test Un',   'CNI', 'TEST-0001', SHA1('seed-ticket-1'), 'valid', 5500, NULL),
  (2, 1, 1, (SELECT id FROM seats WHERE bus_id = 1 AND seat_no = 2), 'Client Test Un B', 'CNI', 'TEST-0002', SHA1('seed-ticket-2'), 'valid', 5500, NULL),
  (3, 2, 2, (SELECT id FROM seats WHERE bus_id = 2 AND seat_no = 5), 'Client Test Deux', 'CNI', 'TEST-0003', SHA1('seed-ticket-3'), 'valid', 6000, NULL),
  (4, 3, 9, (SELECT id FROM seats WHERE bus_id = 2 AND seat_no = 8), 'Client Test Un',   'CNI', 'TEST-0001', SHA1('seed-ticket-4'), 'boarded', 5500, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 65 MINUTE)),
  (5, 4, 10,(SELECT id FROM seats WHERE bus_id = 5 AND seat_no = 3), 'Client Test Deux', 'CNI', 'TEST-0003', SHA1('seed-ticket-5'), 'valid', 5500, NULL);

-- Le billet 1 a un bagage (donc non transférable) ; les autres n'en ont pas
INSERT INTO luggage (ticket_id, tag_code, pieces, weight_kg, fee, status) VALUES
  (1, 'BG-0001', 1, 18.5, 0, 'checked_in');

INSERT INTO payments (booking_id, provider, idempotency_key, amount, currency_code, status, sandbox) VALUES
  (1, 'sandbox', 'seed-pay-1', 11000, 'XAF', 'succeeded', 1),
  (2, 'sandbox', 'seed-pay-2',  6000, 'XAF', 'succeeded', 1),
  (3, 'sandbox', 'seed-pay-3',  5500, 'XAF', 'succeeded', 1),
  (4, 'sandbox', 'seed-pay-4',  5500, 'XAF', 'succeeded', 1);

-- ---------- Fidélité ----------
INSERT INTO loyalty_rewards (agency_id, title, description, points_required) VALUES
  (1, 'Bagage supplémentaire offert', '10 kg de bagage en plus sur un voyage', 30),
  (1, 'Surclassement VIP',            'Un siège VIP au prix standard',           60),
  (1, 'Voyage offert',                'Un aller simple sur la ligne de votre choix', 120),
  (2, 'Boisson et snack offerts',     'À bord, sur présentation du bon',          20),
  (2, 'Voyage offert',                'Un aller simple Dakar – Touba',            100),
  (3, 'Wi-Fi premium',                'Wi-Fi illimité pendant le trajet',         20),
  (3, '-50 % sur un trajet',          'Réduction sur le prochain billet',         80);

INSERT INTO loyalty_ledger (user_id, agency_id, year, points, reason, ticket_id) VALUES
  (12, 1, YEAR(UTC_TIMESTAMP()), 10, 'trip', 4),
  (12, 1, YEAR(UTC_TIMESTAMP()), 30, 'bonus', NULL);

-- ---------- Messagerie : groupe général de chaque agence ----------
INSERT INTO chat_groups (id, agency_id, name, description, kind, theme, created_by) VALUES
  (1, 1, 'Équipe Équateur Voyages', 'Tout le personnel de l''agence', 'general', 'aurora', 2),
  (2, 1, 'Chauffeurs & programmation', 'Départs, retards, incidents', 'custom', 'ocean', 2),
  (3, 2, 'Équipe Baobab Lines', 'Tout le personnel de l''agence', 'general', 'savane', 6),
  (4, 3, 'Équipe Rhône Cars', 'Tout le personnel de l''agence', 'general', 'aurora', 9);

INSERT INTO chat_members (group_id, user_id, is_admin)
SELECT 1, user_id, role = 'owner' FROM agency_staff WHERE agency_id = 1;
INSERT INTO chat_members (group_id, user_id, is_admin) VALUES (2, 2, 1), (2, 14, 0), (2, 4, 0), (2, 5, 0), (2, 3, 0);
INSERT INTO chat_members (group_id, user_id, is_admin)
SELECT 3, user_id, role = 'owner' FROM agency_staff WHERE agency_id = 2;
INSERT INTO chat_members (group_id, user_id, is_admin)
SELECT 4, user_id, role = 'owner' FROM agency_staff WHERE agency_id = 3;

-- ---------- Location et vente de bus ----------
INSERT INTO bus_listings (agency_id, title, brand, model, year, seats, mileage_km, price, currency_code, description, photo_path) VALUES
  (1, 'Autocar grand tourisme 2019', 'Yutong', 'ZK6122H9', 2019, 53, 310000, 38000000, 'XAF', 'Climatisation, toilettes, sièges inclinables. Entretien complet en agence.', '/media/bus.jpeg'),
  (1, 'Minibus 30 places',           'Toyota', 'Coaster',  2017, 30, 240000, 18500000, 'XAF', 'Idéal navettes et location. Carnet d''entretien disponible.', NULL),
  (3, 'Coach VIP 2021',              'Setra',  'S 516 HD', 2021, 49, 180000, 21000000, 'EUR', 'Wi-Fi, prises USB, sièges cuir. Première main.', NULL);

-- Purge des données de test avant la production (à exécuter volontairement) :
-- ---------- Messages d'équipe en clair (visibles par tous les membres de l'agence) ----------
INSERT INTO chat_messages (group_id, sender_user_id, kind, ciphertext, created_at) VALUES
  (1, 2,  'text', 'Bonjour à toute l''équipe Équateur Voyages ! Les départs du jour sont ouverts.', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 MINUTE)),
  (1, 3,  'text', 'Reçu chef ! L''embarquement du départ Yaoundé → Douala s''est bien passé au guichet.', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 70 MINUTE)),
  (1, 4,  'text', 'En route sur l''axe Yaoundé → Douala, trafic fluide après le péage (72 km/h).', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)),
  (2, 14, 'text', 'Paul et Joseph, vérifiez vos niveaux avant les départs de cet après-midi.', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 50 MINUTE)),
  (2, 4,  'text', 'Bien reçu Brice, Coach Équateur 2 tourne parfaitement.', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 35 MINUTE));

-- ---------- Ancien trajet terminé (Historique GPS & télémétrie) ----------
INSERT INTO trips (id, agency_id, route_id, bus_id, departs_at, arrives_at, price, vip_price, status, actual_departed_at, actual_arrived_at, delay_minutes) VALUES
  (11, 1, 1, 1, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 HOUR), DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 HOUR), 5500, 8000, 'completed', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 HOUR), DATE_SUB(UTC_TIMESTAMP(), INTERVAL 115 MINUTE), 5);
INSERT INTO trip_drivers (trip_id, driver_id, position) VALUES (11, 1, 1);
INSERT INTO trip_status_updates (trip_id, user_id, kind, cause, delay_minutes, lat, lng, speed_kmh, progress_pct, note, created_at) VALUES
  (11, 4, 'departed', NULL, NULL, 4.051100, 9.767900, 0, 0, 'Départ de Douala (bus complet)', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 360 MINUTE)),
  (11, 4, 'position', NULL, NULL, 3.980000, 10.350000, 75, 45, 'Passage Édéa RAS', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 250 MINUTE)),
  (11, 4, 'prolonged_stop', 'prolonged_stop', 5, 3.910000, 10.950000, 0, 72, 'Contrôle routier 5 min', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 180 MINUTE)),
  (11, 4, 'arrived', NULL, NULL, 3.848000, 11.502100, 0, 100, 'Arrivée à Yaoundé Terminus', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 115 MINUTE));

-- ---------- Commissions automatiques VELTRON (0,5 % par voyage) ----------
INSERT INTO platform_commissions (trip_id, agency_id, seats_filled, seat_capacity, is_full_bus, gross_amount, rate_bps, commission_amount, currency_code, trigger_event, status, settled_at) VALUES
  (11, 1, 40, 40, 1, 220000, 50, 1100, 'XAF', 'full_bus', 'settled', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 HOUR)),
  (9,  1,  1, 50, 0,   5500, 50,   28, 'XAF', 'departed', 'settled', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR));

-- Purge des données de test avant la production (à exécuter volontairement) :
--   DELETE FROM users WHERE is_seed = 1;  -- puis supprimer les agences is_seed = 1
