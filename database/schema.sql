-- =============================================================================
-- VELTRON – Schéma MySQL 8 (multi-agences, international) – version 2
-- Moteur InnoDB, utf8mb4. Tous les montants sont en "unités mineures"
-- (entiers) avec leur devise : 5500 XAF = 5500 ; 12,50 EUR = 1250.
-- Toutes les dates sont stockées en UTC ; le fuseau local vient de cities.timezone.
--
-- Ordre d'installation (base neuve) :
--   1. schema.sql   2. seed.sql   3. world_countries.sql   4. php bin/set_test_passwords.php
-- =============================================================================
SET NAMES utf8mb4;
DROP DATABASE IF EXISTS veltron;
CREATE DATABASE veltron CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE veltron;

-- ---------- Référentiels mondiaux ----------
CREATE TABLE currencies (
  code        CHAR(3) PRIMARY KEY,               -- ISO 4217
  name        VARCHAR(80) NOT NULL,
  symbol      VARCHAR(8) NOT NULL,
  minor_units TINYINT UNSIGNED NOT NULL          -- décimales (XAF=0, EUR=2)
) ENGINE=InnoDB;

CREATE TABLE countries (
  id               SMALLINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  iso2             CHAR(2) NOT NULL UNIQUE,
  name_fr          VARCHAR(80) NOT NULL,
  name_en          VARCHAR(80) NOT NULL,
  default_currency CHAR(3) NOT NULL,
  phone_prefix     VARCHAR(8) NOT NULL,
  FOREIGN KEY (default_currency) REFERENCES currencies(code)
) ENGINE=InnoDB;

CREATE TABLE cities (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  country_id SMALLINT UNSIGNED NOT NULL,
  name       VARCHAR(80) NOT NULL,
  timezone   VARCHAR(40) NOT NULL,               -- ex. Africa/Douala
  lat        DECIMAL(9,6) NULL,
  lng        DECIMAL(9,6) NULL,
  UNIQUE KEY uq_city (country_id, name),
  FOREIGN KEY (country_id) REFERENCES countries(id)
) ENGINE=InnoDB;

-- ---------- Utilisateurs ----------
CREATE TABLE users (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email          VARCHAR(190) NOT NULL UNIQUE,
  phone          VARCHAR(25) NULL,
  password_hash  VARCHAR(255) NULL,              -- argon2id/bcrypt (jamais en clair)
  first_name     VARCHAR(80) NOT NULL,
  last_name      VARCHAR(80) NOT NULL,
  locale         CHAR(2) NOT NULL DEFAULT 'fr',
  platform_role  ENUM('none','admin','super_admin') NOT NULL DEFAULT 'none',
  status         ENUM('active','suspended','pending') NOT NULL DEFAULT 'active',
  failed_logins  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until   DATETIME NULL,                  -- verrouillage après trop d'échecs
  last_login_at  DATETIME NULL,
  is_seed        TINYINT(1) NOT NULL DEFAULT 0,  -- 1 = donnée de test (purgeable)
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------- Agences (chaque agence = un "locataire" isolé) ----------
CREATE TABLE agencies (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_code           CHAR(9) NOT NULL UNIQUE,       -- identifiant fourni à la création : AG-XXXXXX
  slug                  VARCHAR(60) NOT NULL UNIQUE,   -- /passager/a/<slug>
  name                  VARCHAR(120) NOT NULL,
  country_id            SMALLINT UNSIGNED NOT NULL,
  city_name             VARCHAR(80) NULL,
  currency_code         CHAR(3) NOT NULL,
  primary_color         CHAR(7) NOT NULL DEFAULT '#8C6BB8',
  logo_path             VARCHAR(255) NULL,
  cover_path            VARCHAR(255) NULL,
  legal_id              VARCHAR(60) NULL,              -- n° RCCM / registre du commerce
  website               VARCHAR(190) NULL,
  email                 VARCHAR(190) NOT NULL UNIQUE,
  phone                 VARCHAR(25) NULL,
  address               VARCHAR(255) NOT NULL,
  address_normalized    VARCHAR(255) NOT NULL,         -- deux agences ne peuvent pas partager une adresse
  document_path         VARCHAR(255) NULL,
  document_mime         VARCHAR(40) NULL,
  verification_status   ENUM('unverified','pending','review','approved','rejected') NOT NULL DEFAULT 'unverified',
  verification_score    TINYINT UNSIGNED NULL,
  verification_report   JSON NULL,
  verified_at           DATETIME NULL,
  registered_ip         VARCHAR(45) NULL,
  status                ENUM('pending','active','suspended') NOT NULL DEFAULT 'pending',
  -- Politique d'annulation : aucun remboursement après ce délai avant départ
  refund_cutoff_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 120,
  free_baggage_kg       DECIMAL(5,1) NOT NULL DEFAULT 20.0,
  baggage_fee_per_kg    INT UNSIGNED NOT NULL DEFAULT 0,
  transfer_fee          INT UNSIGNED NOT NULL DEFAULT 0, -- frais de report/transfert
  fill_window_minutes   SMALLINT UNSIGNED NOT NULL DEFAULT 40, -- écart max entre 2 départs pour compléter un bus
  points_per_trip       SMALLINT UNSIGNED NOT NULL DEFAULT 10, -- fidélité : points gagnés par voyage
  commission_rate_bps   SMALLINT UNSIGNED NOT NULL DEFAULT 50, -- 50 bps = 0,50 % versés automatiquement à VELTRON
  contract_accepted_at  DATETIME NULL,                         -- signature horodatée du contrat de partenariat 0,5 %
  is_seed               TINYINT(1) NOT NULL DEFAULT 0,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_agency_address_normalized (address_normalized),
  CONSTRAINT chk_cutoff CHECK (refund_cutoff_minutes >= 120),   -- règle : 2 h minimum
  CONSTRAINT chk_fill CHECK (fill_window_minutes BETWEEN 5 AND 240),
  FOREIGN KEY (country_id)    REFERENCES countries(id),
  FOREIGN KEY (currency_code) REFERENCES currencies(code)
) ENGINE=InnoDB;

-- Grille de remboursement : pourcentage selon le délai avant départ
CREATE TABLE refund_tiers (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id          INT UNSIGNED NOT NULL,
  min_minutes_before INT UNSIGNED NOT NULL,      -- ex. 1440 = 24 h
  refund_percent     TINYINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_tier (agency_id, min_minutes_before),
  CONSTRAINT chk_pct CHECK (refund_percent <= 100),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Personnel de l'agence. Chaque compte est personnel : l'isolation se fait par agency_id + role.
--   owner      = administrateur de l'agence (créateur)
--   manager    = responsable programmation (horaires, flotte, lignes)
--   secretary  = secrétaire (départs/arrivées, billets, appel, transferts)
--   driver     = chauffeur
--   staff      = membre du personnel
--   accountant = comptable (recettes, remboursements)
CREATE TABLE agency_staff (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id     INT UNSIGNED NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL,
  role          ENUM('owner','manager','secretary','driver','staff','accountant') NOT NULL,
  job_title     VARCHAR(80) NULL,
  status        ENUM('active','disabled') NOT NULL DEFAULT 'active',
  invited_by    BIGINT UNSIGNED NULL,
  last_login_at DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_staff (agency_id, user_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE drivers (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id        INT UNSIGNED NOT NULL,
  user_id          BIGINT UNSIGNED NOT NULL,
  photo_path       VARCHAR(255) NULL,
  photo_consent    TINYINT(1) NOT NULL DEFAULT 0, -- accord du chauffeur pour afficher sa photo
  licence_verified TINYINT(1) NOT NULL DEFAULT 0,
  availability     ENUM('available','on_trip','resting','unavailable','maintenance') NOT NULL DEFAULT 'available',
  mood             TINYINT UNSIGNED NULL,          -- ressenti 1 (mauvais) à 5 (excellent)
  mood_note        VARCHAR(255) NULL,
  status           ENUM('active','inactive') NOT NULL DEFAULT 'active',
  UNIQUE KEY uq_driver (agency_id, user_id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------- Sécurité : sessions révocables, codes à usage unique, limitation de débit ----------
-- Le jeton remis au navigateur n'est jamais stocké : seule son empreinte SHA-256 l'est.
-- Un jeton "passenger" ne donne aucun accès à l'espace agence, et inversement.
CREATE TABLE sessions (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  token_hash   CHAR(64) NOT NULL UNIQUE,
  user_id      BIGINT UNSIGNED NOT NULL,
  realm        ENUM('passenger','agency','platform') NOT NULL,
  agency_id    INT UNSIGNED NULL,
  role         VARCHAR(20) NULL,
  ip           VARCHAR(45) NULL,
  user_agent   VARCHAR(255) NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME NOT NULL,
  revoked_at   DATETIME NULL,
  KEY idx_session_user (user_id, realm),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE otp_codes (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  challenge    CHAR(32) NOT NULL UNIQUE,
  purpose      ENUM('agency_registration','agency_login','passenger_login') NOT NULL,
  email        VARCHAR(190) NOT NULL,
  agency_id    INT UNSIGNED NULL,
  user_id      BIGINT UNSIGNED NULL,
  code_hash    CHAR(64) NOT NULL,                  -- HMAC-SHA256(code, APP_KEY)
  attempts     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  ip           VARCHAR(45) NULL,
  last_sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at   DATETIME NOT NULL,
  consumed_at  DATETIME NULL,
  KEY idx_otp (purpose, email, expires_at)
) ENGINE=InnoDB;

CREATE TABLE rate_limits (
  bucket       VARCHAR(190) PRIMARY KEY,           -- ex. otp_send:ip:1.2.3.4
  hits         INT UNSIGNED NOT NULL DEFAULT 0,
  window_start DATETIME NOT NULL
) ENGINE=InnoDB;

-- Alertes envoyées au propriétaire de la plateforme (e-mail / WhatsApp)
CREATE TABLE platform_alerts (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id  INT UNSIGNED NULL,
  kind       VARCHAR(40) NOT NULL,                 -- agency_review, security …
  title      VARCHAR(190) NOT NULL,
  body       TEXT NOT NULL,
  channels   JSON NULL,                            -- résultat d'envoi par canal
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_alert (resolved_at, created_at)
) ENGINE=InnoDB;

-- ---------- Flotte : bus, disposition, sièges ----------
CREATE TABLE buses (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id  INT UNSIGNED NOT NULL,
  plate      VARCHAR(20) NOT NULL,
  label      VARCHAR(80) NOT NULL,
  bus_type   ENUM('standard','vip','minibus','coach') NOT NULL DEFAULT 'standard',
  seat_count SMALLINT UNSIGNED NOT NULL,
  avg_speed_kmh SMALLINT UNSIGNED NOT NULL DEFAULT 70, -- utilisé pour l'estimation d'arrivée
  has_gps    TINYINT(1) NOT NULL DEFAULT 0,            -- 0 = suivi manuel chauffeur, 1 = boîtier/GPS temps réel
  gps_device_id VARCHAR(60) NULL,                      -- identifiant traceur GPS ou télémétrie
  -- Ex. 2+2 : {"seats_per_row":[2,2]} ; 2+3 : {"seats_per_row":[2,3]}
  layout     JSON NOT NULL,
  status     ENUM('available','maintenance','archived') NOT NULL DEFAULT 'available',
  UNIQUE KEY uq_plate (agency_id, plate),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE seats (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bus_id     INT UNSIGNED NOT NULL,
  seat_no    SMALLINT UNSIGNED NOT NULL,
  row_no     SMALLINT UNSIGNED NOT NULL,
  col_no     TINYINT UNSIGNED NOT NULL,
  seat_class ENUM('standard','vip') NOT NULL DEFAULT 'standard',
  UNIQUE KEY uq_seat (bus_id, seat_no),
  FOREIGN KEY (bus_id) REFERENCES buses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- Lignes et départs ----------
CREATE TABLE routes (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id      INT UNSIGNED NOT NULL,
  origin_city_id INT UNSIGNED NOT NULL,
  dest_city_id   INT UNSIGNED NOT NULL,
  distance_km    SMALLINT UNSIGNED NULL,
  duration_min   SMALLINT UNSIGNED NULL,
  UNIQUE KEY uq_route (agency_id, origin_city_id, dest_city_id),
  CONSTRAINT chk_route CHECK (origin_city_id <> dest_city_id),
  FOREIGN KEY (agency_id)      REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (origin_city_id) REFERENCES cities(id),
  FOREIGN KEY (dest_city_id)   REFERENCES cities(id)
) ENGINE=InnoDB;

CREATE TABLE trips (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id      INT UNSIGNED NOT NULL,
  route_id       INT UNSIGNED NOT NULL,
  bus_id         INT UNSIGNED NOT NULL,
  departs_at     DATETIME NOT NULL,              -- UTC
  arrives_at     DATETIME NULL,
  price          INT UNSIGNED NOT NULL,          -- siège standard, unités mineures
  vip_price      INT UNSIGNED NULL,
  status         ENUM('scheduled','boarding','departed','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  actual_departed_at DATETIME NULL,
  actual_arrived_at  DATETIME NULL,
  delay_minutes  SMALLINT NOT NULL DEFAULT 0,   -- retard déclaré cumulé
  postponed_from DATETIME NULL,                  -- heure initiale si le voyage a été reporté
  KEY idx_search (route_id, departs_at),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (route_id)  REFERENCES routes(id),
  FOREIGN KEY (bus_id)    REFERENCES buses(id)
) ENGINE=InnoDB;

-- Chauffeurs affectés à un départ (la photo affichée vient de cette affectation)
CREATE TABLE trip_drivers (
  trip_id     BIGINT UNSIGNED NOT NULL,
  driver_id   INT UNSIGNED NOT NULL,
  position    TINYINT UNSIGNED NOT NULL DEFAULT 1,  -- 1 = chauffeur principal
  assigned_by BIGINT UNSIGNED NULL,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (trip_id, driver_id),
  FOREIGN KEY (trip_id)   REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (driver_id) REFERENCES drivers(id)
) ENGINE=InnoDB;

CREATE TABLE trip_driver_changes (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trip_id       BIGINT UNSIGNED NOT NULL,
  old_driver_id INT UNSIGNED NULL,
  new_driver_id INT UNSIGNED NULL,
  changed_by    BIGINT UNSIGNED NULL,
  changed_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Suivi en temps réel : position, vitesse, retards déclarés par le chauffeur
CREATE TABLE trip_status_updates (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trip_id        BIGINT UNSIGNED NOT NULL,
  user_id        BIGINT UNSIGNED NOT NULL,
  kind           ENUM('departed','position','delay','prolonged_stop','deviation','breakdown','resumed','arrived','info') NOT NULL,
  cause          ENUM('traffic','breakdown','prolonged_stop','deviation','accident','weather','police','fuel','passenger','other') NULL,
  delay_minutes  SMALLINT NULL,
  lat            DECIMAL(9,6) NULL,
  lng            DECIMAL(9,6) NULL,
  speed_kmh      SMALLINT UNSIGNED NULL,
  progress_pct   TINYINT UNSIGNED NULL,
  note           VARCHAR(255) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tsu_trip (trip_id, created_at),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------- Réservations et billets ----------
CREATE TABLE bookings (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference   VARCHAR(16) NOT NULL UNIQUE,        -- numéro de réservation (appel des passagers)
  agency_id   INT UNSIGNED NOT NULL,
  trip_id     BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NULL,               -- NULL = vente au guichet
  channel     ENUM('online','counter') NOT NULL DEFAULT 'online',
  status      ENUM('pending','paid','cancelled','expired','refunded') NOT NULL DEFAULT 'pending',
  total       INT UNSIGNED NOT NULL,
  currency_code CHAR(3) NOT NULL,
  expires_at  DATETIME NULL,                      -- blocage temporaire (15 min)
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_booking_trip (trip_id, status),
  FOREIGN KEY (agency_id)     REFERENCES agencies(id),
  FOREIGN KEY (trip_id)       REFERENCES trips(id),
  FOREIGN KEY (user_id)       REFERENCES users(id),
  FOREIGN KEY (currency_code) REFERENCES currencies(code)
) ENGINE=InnoDB;

-- RÈGLE D'OR : un siège ne peut avoir qu'un seul billet ACTIF par départ.
-- La colonne générée active_seat_id vaut seat_id si le billet occupe le siège, NULL sinon.
-- En SQL, UNIQUE ignore les NULL : deux billets annulés coexistent, deux billets actifs sont refusés.
CREATE TABLE tickets (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id     BIGINT UNSIGNED NOT NULL,
  trip_id        BIGINT UNSIGNED NOT NULL,
  seat_id        BIGINT UNSIGNED NOT NULL,
  passenger_name VARCHAR(120) NOT NULL,
  id_type        VARCHAR(30) NULL,
  id_number      VARCHAR(40) NULL,
  phone          VARCHAR(25) NULL,
  qr_token       CHAR(40) NOT NULL UNIQUE,
  status         ENUM('held','valid','boarded','no_show','cancelled','transferred','refunded','expired') NOT NULL DEFAULT 'held',
  checked_in_at  DATETIME NULL,
  boarded_at     DATETIME NULL,
  late_notice    VARCHAR(120) NULL,
  price          INT UNSIGNED NOT NULL,
  active_seat_id BIGINT UNSIGNED GENERATED ALWAYS AS (
                   IF(status IN ('held','valid','boarded'), seat_id, NULL)
                 ) STORED,
  UNIQUE KEY uq_active_seat (trip_id, active_seat_id),
  KEY idx_ticket_booking (booking_id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id)    REFERENCES trips(id),
  FOREIGN KEY (seat_id)    REFERENCES seats(id)
) ENGINE=InnoDB;

CREATE TABLE ticket_transfers (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  old_ticket_id     BIGINT UNSIGNED NOT NULL,
  new_ticket_id     BIGINT UNSIGNED NOT NULL,
  from_trip_id      BIGINT UNSIGNED NOT NULL,
  to_trip_id        BIGINT UNSIGNED NOT NULL,
  kind              ENUM('postpone','advance_fill','missed_bus') NOT NULL,
  fee               INT UNSIGNED NOT NULL DEFAULT 0,
  passenger_consent TINYINT(1) NOT NULL DEFAULT 0,
  done_by           BIGINT UNSIGNED NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (old_ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (new_ticket_id) REFERENCES tickets(id)
) ENGINE=InnoDB;

-- ---------- Bagages (liés au billet ; bloquent le transfert "remplissage" si présents) ----------
CREATE TABLE luggage (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id  BIGINT UNSIGNED NOT NULL,
  tag_code   VARCHAR(20) NOT NULL UNIQUE,
  pieces     TINYINT UNSIGNED NOT NULL DEFAULT 1,
  weight_kg  DECIMAL(5,1) NOT NULL DEFAULT 0,
  fee        INT UNSIGNED NOT NULL DEFAULT 0,
  status     ENUM('checked_in','loaded','delivered','incident') NOT NULL DEFAULT 'checked_in',
  note       VARCHAR(255) NULL,
  created_by BIGINT UNSIGNED NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id)
) ENGINE=InnoDB;

-- ---------- Paiements et remboursements ----------
CREATE TABLE payments (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id      BIGINT UNSIGNED NOT NULL,
  provider        VARCHAR(40) NOT NULL,            -- mtn_momo, orange_money, card, cash…
  provider_ref    VARCHAR(80) NULL,
  idempotency_key VARCHAR(80) NOT NULL UNIQUE,     -- évite les doubles débits
  amount          INT UNSIGNED NOT NULL,
  currency_code   CHAR(3) NOT NULL,
  status          ENUM('initiated','succeeded','failed','refunded') NOT NULL DEFAULT 'initiated',
  sandbox         TINYINT(1) NOT NULL DEFAULT 1,   -- 1 tant qu'aucun fournisseur réel n'est branché
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (currency_code) REFERENCES currencies(code)
) ENGINE=InnoDB;

CREATE TABLE refunds (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id   BIGINT UNSIGNED NOT NULL,
  ticket_id    BIGINT UNSIGNED NOT NULL,
  amount       INT UNSIGNED NOT NULL,
  reason       ENUM('passenger_request','agency_cancelled','delay') NOT NULL,
  status       ENUM('requested','approved','paid','rejected') NOT NULL DEFAULT 'requested',
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES payments(id),
  FOREIGN KEY (ticket_id)  REFERENCES tickets(id)
) ENGINE=InnoDB;

-- ---------- Commissions automatiques VELTRON (0,5 % par voyage au départ / bus plein) ----------
CREATE TABLE platform_commissions (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  trip_id           BIGINT UNSIGNED NOT NULL UNIQUE,
  agency_id         INT UNSIGNED NOT NULL,
  seats_filled      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  seat_capacity     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_full_bus       TINYINT(1) NOT NULL DEFAULT 0,
  gross_amount      INT UNSIGNED NOT NULL DEFAULT 0,
  rate_bps          SMALLINT UNSIGNED NOT NULL DEFAULT 50,       -- 50 bps = 0,50 %
  commission_amount INT UNSIGNED NOT NULL DEFAULT 0,             -- 0,5 % crédités automatiquement au propriétaire VELTRON
  currency_code     CHAR(3) NOT NULL,
  trigger_event     ENUM('departed','full_bus','completed') NOT NULL DEFAULT 'departed',
  status            ENUM('settled') NOT NULL DEFAULT 'settled',
  settled_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_comm_agency (agency_id, settled_at),
  FOREIGN KEY (trip_id)       REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id)     REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (currency_code) REFERENCES currencies(code)
) ENGINE=InnoDB;

-- ---------- Fidélité : points par agence, remis à zéro chaque année ----------
CREATE TABLE loyalty_rewards (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id       INT UNSIGNED NOT NULL,
  title           VARCHAR(120) NOT NULL,
  description     VARCHAR(255) NULL,
  points_required INT UNSIGNED NOT NULL,
  active          TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE loyalty_ledger (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  agency_id  INT UNSIGNED NOT NULL,
  year       SMALLINT UNSIGNED NOT NULL,           -- seuls les points de l'année en cours comptent
  points     INT NOT NULL,                         -- + gain, − utilisation
  reason     ENUM('trip','redeem','bonus','adjust') NOT NULL,
  ticket_id  BIGINT UNSIGNED NULL UNIQUE,          -- un seul gain par billet
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_loyalty (user_id, agency_id, year),
  FOREIGN KEY (user_id)   REFERENCES users(id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE loyalty_redemptions (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  agency_id  INT UNSIGNED NOT NULL,
  reward_id  INT UNSIGNED NOT NULL,
  code       CHAR(10) NOT NULL UNIQUE,             -- bon présenté au guichet
  status     ENUM('issued','used','cancelled') NOT NULL DEFAULT 'issued',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)   REFERENCES users(id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (reward_id) REFERENCES loyalty_rewards(id)
) ENGINE=InnoDB;

-- ---------- Location et achat de bus ----------
CREATE TABLE rental_requests (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference     CHAR(10) NOT NULL UNIQUE,
  user_id       BIGINT UNSIGNED NULL,
  agency_id     INT UNSIGNED NULL,                 -- NULL = demande ouverte à toutes les agences du pays
  country_id    SMALLINT UNSIGNED NOT NULL,
  departure     VARCHAR(120) NOT NULL,
  destination   VARCHAR(120) NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  passengers    SMALLINT UNSIGNED NOT NULL,
  bus_type      ENUM('standard','vip','minibus','coach') NOT NULL DEFAULT 'coach',
  with_driver   TINYINT(1) NOT NULL DEFAULT 1,
  contact_name  VARCHAR(120) NOT NULL,
  contact_email VARCHAR(190) NOT NULL,
  contact_phone VARCHAR(25) NOT NULL,
  notes         TEXT NULL,
  status        ENUM('new','quoted','accepted','declined','closed') NOT NULL DEFAULT 'new',
  quote_amount  INT UNSIGNED NULL,
  agency_reply  TEXT NULL,
  answered_by_agency INT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_rental_dates CHECK (end_date >= start_date),
  FOREIGN KEY (country_id) REFERENCES countries(id)
) ENGINE=InnoDB;

CREATE TABLE bus_listings (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id     INT UNSIGNED NOT NULL,
  title         VARCHAR(120) NOT NULL,
  brand         VARCHAR(60) NOT NULL,
  model         VARCHAR(60) NULL,
  year          SMALLINT UNSIGNED NOT NULL,
  seats         SMALLINT UNSIGNED NOT NULL,
  mileage_km    INT UNSIGNED NULL,
  price         BIGINT UNSIGNED NOT NULL,
  currency_code CHAR(3) NOT NULL,
  description   TEXT NULL,
  photo_path    VARCHAR(255) NULL,
  status        ENUM('active','sold','hidden') NOT NULL DEFAULT 'active',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE,
  FOREIGN KEY (currency_code) REFERENCES currencies(code)
) ENGINE=InnoDB;

CREATE TABLE bus_inquiries (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  listing_id INT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NULL,
  name       VARCHAR(120) NOT NULL,
  email      VARCHAR(190) NOT NULL,
  phone      VARCHAR(25) NULL,
  message    TEXT NOT NULL,
  status     ENUM('new','answered','closed') NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (listing_id) REFERENCES bus_listings(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- Avis vérifiés (un seul par billet) ----------
CREATE TABLE reviews (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id     BIGINT UNSIGNED NOT NULL UNIQUE,
  user_id       BIGINT UNSIGNED NOT NULL,
  agency_id     INT UNSIGNED NOT NULL,
  trip_id       BIGINT UNSIGNED NOT NULL,
  bus_id        INT UNSIGNED NOT NULL,
  rating_agency TINYINT UNSIGNED NOT NULL,
  rating_bus    TINYINT UNSIGNED NOT NULL,
  rating_trip   TINYINT UNSIGNED NOT NULL,
  comment       TEXT NULL,
  agency_reply  TEXT NULL,
  status        ENUM('pending','published','hidden') NOT NULL DEFAULT 'pending',
  is_seed       TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_ratings CHECK (rating_agency BETWEEN 1 AND 5
    AND rating_bus BETWEEN 1 AND 5 AND rating_trip BETWEEN 1 AND 5),
  KEY idx_review_agency (agency_id, status),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (user_id)   REFERENCES users(id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id)
) ENGINE=InnoDB;

-- ---------- Messagerie d'équipe interne à chaque agence (en clair entre collègues) ----------
-- Tous les membres actifs d'une même agence voient les messages échangés dans leurs salons
-- (isolation stricte par agency_id côté serveur, aucun chiffrement bloquant entre collègues).
CREATE TABLE chat_groups (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  agency_id   INT UNSIGNED NOT NULL,
  name        VARCHAR(80) NOT NULL,
  description VARCHAR(190) NULL,
  kind        ENUM('general','custom') NOT NULL DEFAULT 'custom',
  theme       VARCHAR(30) NOT NULL DEFAULT 'aurora',
  created_by  BIGINT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE chat_members (
  group_id      BIGINT UNSIGNED NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL,
  is_admin      TINYINT(1) NOT NULL DEFAULT 0,
  last_read_id  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  joined_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)  REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE chat_user_keys (
  user_id     BIGINT UNSIGNED NOT NULL,
  agency_id   INT UNSIGNED NOT NULL,
  public_jwk  TEXT NOT NULL,                       -- clé publique ECDH P-256 (JWK)
  fingerprint CHAR(64) NOT NULL,                   -- SHA-256 de la clé publique
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, agency_id),
  FOREIGN KEY (user_id)   REFERENCES users(id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE chat_group_keys (
  group_id   BIGINT UNSIGNED NOT NULL,
  version    INT UNSIGNED NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, version),
  FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE chat_key_envelopes (
  group_id              BIGINT UNSIGNED NOT NULL,
  version               INT UNSIGNED NOT NULL,
  user_id               BIGINT UNSIGNED NOT NULL,   -- destinataire
  recipient_fingerprint CHAR(64) NOT NULL,
  sender_user_id        BIGINT UNSIGNED NOT NULL,
  sender_public_jwk     TEXT NOT NULL,
  iv                    VARCHAR(32) NOT NULL,
  wrapped_key           VARCHAR(255) NOT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, version, user_id, recipient_fingerprint),
  FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE chat_messages (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  group_id       BIGINT UNSIGNED NOT NULL,
  sender_user_id BIGINT UNSIGNED NOT NULL,
  kind           ENUM('text','system') NOT NULL DEFAULT 'text',
  key_version    INT UNSIGNED NULL,
  iv             VARCHAR(32) NULL,
  ciphertext     MEDIUMTEXT NOT NULL,              -- texte du message visible par toute l'équipe de l'agence
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_chat_msg (group_id, id),
  FOREIGN KEY (group_id) REFERENCES chat_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- ---------- Notifications et journal d'audit ----------
CREATE TABLE notifications (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    BIGINT UNSIGNED NOT NULL,
  type       VARCHAR(40) NOT NULL,                -- trip_postponed, delay, ticket_transferred…
  payload    JSON NULL,
  read_at    DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_notif_user (user_id, read_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT UNSIGNED NULL,
  agency_id     INT UNSIGNED NULL,
  action        VARCHAR(60) NOT NULL,             -- ticket.transfer, id.view, auth.login…
  entity        VARCHAR(40) NULL,
  entity_id     BIGINT UNSIGNED NULL,
  ip            VARCHAR(45) NULL,
  meta          JSON NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit (agency_id, created_at)
) ENGINE=InnoDB;
