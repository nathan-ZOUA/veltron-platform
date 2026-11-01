-- Replace les départs de test dans le futur (heures relatives à MAINTENANT, en UTC).
-- À relancer quand les départs de test sont passés :
--   mysql -u root --default-character-set=utf8mb4 veltron < database/refresh_trips.sql
SET NAMES utf8mb4;
USE veltron;

UPDATE trips t
JOIN agencies a ON a.id = t.agency_id AND a.is_seed = 1
JOIN routes r ON r.id = t.route_id
SET t.status = CASE WHEN t.id = 9 THEN 'departed' WHEN t.id = 11 THEN 'completed' ELSE 'scheduled' END,
    t.actual_departed_at = CASE WHEN t.id = 9 THEN DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR) WHEN t.id = 11 THEN DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 HOUR) ELSE NULL END,
    t.actual_arrived_at = CASE WHEN t.id = 11 THEN DATE_SUB(UTC_TIMESTAMP(), INTERVAL 115 MINUTE) ELSE NULL END,
    t.departs_at = CASE
      WHEN t.id = 9  THEN DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)
      WHEN t.id = 11 THEN DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 HOUR)
      WHEN t.id = 10 THEN DATE_ADD(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 3 HOUR), INTERVAL 35 MINUTE)
      ELSE DATE_ADD(UTC_TIMESTAMP(), INTERVAL
        CASE t.id WHEN 1 THEN 3 WHEN 2 THEN 6 WHEN 3 THEN 10 WHEN 4 THEN 26
                  WHEN 5 THEN 4 WHEN 6 THEN 28 WHEN 7 THEN 8 WHEN 8 THEN 30 ELSE 12 END HOUR)
    END,
    t.arrives_at = CASE
      WHEN t.id = 9  THEN DATE_ADD(UTC_TIMESTAMP(), INTERVAL 3 HOUR)
      WHEN t.id = 10 THEN DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)
      ELSE DATE_ADD(DATE_ADD(UTC_TIMESTAMP(), INTERVAL
        CASE t.id WHEN 1 THEN 3 WHEN 2 THEN 6 WHEN 3 THEN 10 WHEN 4 THEN 26
                  WHEN 5 THEN 4 WHEN 6 THEN 28 WHEN 7 THEN 8 WHEN 8 THEN 30 ELSE 12 END HOUR),
        INTERVAL COALESCE(r.duration_min, 240) MINUTE)
    END;
