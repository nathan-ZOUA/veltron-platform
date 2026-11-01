<?php
declare(strict_types=1);

require __DIR__ . '/../src/core.php';

echo "[migrate_v2] Application des migrations pour : matricule, custom_role, avatar_url, analytics...\n";

// 1. Colonnes sur agency_staff
$colsStaff = array_column(all("SHOW COLUMNS FROM agency_staff"), 'Field');

if (!in_array('matricule', $colsStaff, true)) {
    q("ALTER TABLE agency_staff ADD COLUMN matricule VARCHAR(50) NULL AFTER job_title");
    echo "  + Colonne 'matricule' ajoutée à agency_staff\n";
}

if (!in_array('custom_role', $colsStaff, true)) {
    q("ALTER TABLE agency_staff ADD COLUMN custom_role VARCHAR(100) NULL AFTER matricule");
    echo "  + Colonne 'custom_role' ajoutée à agency_staff\n";
}

if (!in_array('avatar_url', $colsStaff, true)) {
    q("ALTER TABLE agency_staff ADD COLUMN avatar_url TEXT NULL AFTER custom_role");
    echo "  + Colonne 'avatar_url' ajoutée à agency_staff\n";
}

// 2. Colonne avatar_url sur users
$colsUsers = array_column(all("SHOW COLUMNS FROM users"), 'Field');
if (!in_array('avatar_url', $colsUsers, true)) {
    q("ALTER TABLE users ADD COLUMN avatar_url TEXT NULL AFTER phone");
    echo "  + Colonne 'avatar_url' ajoutée à users\n";
}

// 3. Index sur (agency_id, matricule)
$indexesStaff = array_column(all("SHOW INDEX FROM agency_staff"), 'Key_name');
if (!in_array('idx_staff_agency_matricule', $indexesStaff, true)) {
    q("ALTER TABLE agency_staff ADD INDEX idx_staff_agency_matricule (agency_id, matricule)");
    echo "  + Index 'idx_staff_agency_matricule' créé\n";
}

// 4. Générer des matricules par défaut pour le personnel de test existant
$staffMembers = all("SELECT id, agency_id, role, matricule FROM agency_staff");
foreach ($staffMembers as $s) {
    if (empty($s['matricule'])) {
        $prefix = match ($s['role']) {
            'owner'      => 'DIR',
            'manager'    => 'PRG',
            'secretary'  => 'SEC',
            'driver'     => 'CHAUF',
            'accountant' => 'CPT',
            default      => 'STF',
        };
        $genMatricule = sprintf('AG%d-%s-%02d', (int) $s['agency_id'], $prefix, (int) $s['id']);
        q("UPDATE agency_staff SET matricule = ?, custom_role = ? WHERE id = ?", [
            $genMatricule,
            $s['role'] === 'owner' ? 'Directeur Général' : ($s['role'] === 'secretary' ? 'Secrétaire de Gare' : ucfirst($s['role'])),
            (int) $s['id'],
        ]);
        echo "  + Matricule généré : $genMatricule pour le staff #{$s['id']}\n";
    }
}

// 5. Colonnes GPS temps réel sur trips
$colsTrips = array_column(all("SHOW COLUMNS FROM trips"), 'Field');
if (!in_array('current_lat', $colsTrips, true)) {
    q("ALTER TABLE trips ADD COLUMN current_lat DECIMAL(10, 6) NULL AFTER delay_minutes");
    echo "  + Colonne 'current_lat' ajoutée à trips\n";
}
if (!in_array('current_lng', $colsTrips, true)) {
    q("ALTER TABLE trips ADD COLUMN current_lng DECIMAL(10, 6) NULL AFTER current_lat");
    echo "  + Colonne 'current_lng' ajoutée à trips\n";
}
if (!in_array('current_speed_kmh', $colsTrips, true)) {
    q("ALTER TABLE trips ADD COLUMN current_speed_kmh SMALLINT UNSIGNED NULL AFTER current_lng");
    echo "  + Colonne 'current_speed_kmh' ajoutée à trips\n";
}
if (!in_array('current_progress_pct', $colsTrips, true)) {
    q("ALTER TABLE trips ADD COLUMN current_progress_pct TINYINT UNSIGNED NULL DEFAULT 0 AFTER current_speed_kmh");
    echo "  + Colonne 'current_progress_pct' ajoutée à trips\n";
}
if (!in_array('last_gps_at', $colsTrips, true)) {
    q("ALTER TABLE trips ADD COLUMN last_gps_at DATETIME NULL AFTER current_progress_pct");
    echo "  + Colonne 'last_gps_at' ajoutée à trips\n";
}

echo "[migrate_v2] Terminé avec succès !\n";

