<?php
declare(strict_types=1);

// =============================================================================
// Installation complète (ou réinitialisation) de la base MySQL VELTRON :
//   php backend/bin/install_db.php
// =============================================================================

require __DIR__ . '/../src/core.php';

function split_sql_statements(string $sql): array
{
    // Supprime les commentaires sur ligne entière (-- ...)
    $lines = preg_split('/\R/', $sql) ?: [];
    $clean = [];
    foreach ($lines as $line) {
        $trim = ltrim($line);
        if ($trim === '' || str_starts_with($trim, '--')) continue;
        // Supprime les commentaires inline hors apostrophes simples
        $clean[] = $line;
    }
    $text = implode("\n", $clean);

    $statements = [];
    $buf = '';
    $inSingle = false;
    $len = strlen($text);
    for ($i = 0; $i < $len; $i++) {
        $ch = $text[$i];
        if (!$inSingle && $ch === '-' && ($i + 1 < $len) && $text[$i + 1] === '-') {
            while ($i < $len && $text[$i] !== "\n") $i++;
            $buf .= "\n";
            continue;
        }
        if ($ch === "'") {
            if ($inSingle && ($i + 1 < $len) && $text[$i + 1] === "'") {
                $buf .= "''";
                $i++;
                continue;
            }
            $inSingle = !$inSingle;
            $buf .= $ch;
        } elseif ($ch === ';' && !$inSingle) {
            $stmt = trim($buf);
            if ($stmt !== '') $statements[] = $stmt;
            $buf = '';
        } else {
            $buf .= $ch;
        }
    }
    if (trim($buf) !== '') $statements[] = trim($buf);
    return $statements;
}

$dsn = sprintf('mysql:host=%s;port=%s;charset=utf8mb4', env('DB_HOST', '127.0.0.1'), env('DB_PORT', '3306'));
$pdo = new PDO($dsn, env('DB_USER', 'root'), env('DB_PASS', ''), [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);
$pdo->exec("SET NAMES utf8mb4");

$dbDir = realpath(__DIR__ . '/../../database');
foreach (['schema.sql', 'seed.sql', 'world_countries.sql'] as $file) {
    $path = $dbDir . DIRECTORY_SEPARATOR . $file;
    echo "Import de $file ... ";
    $sql = file_get_contents($path);
    if ($sql === false) throw new RuntimeException("Impossible de lire $path");
    $stmts = split_sql_statements($sql);
    foreach ($stmts as $s) {
        $pdo->exec($s);
    }
    echo count($stmts) . " instructions exécutées.\n";
}

$password = 'Veltron#2026';
$algo = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
$stmt = $pdo->prepare('UPDATE veltron.users SET password_hash = ? WHERE is_seed = 1');
$stmt->execute([password_hash($password, $algo)]);
echo $stmt->rowCount() . " comptes de démonstration initialisés (mot de passe : $password).\n";
echo "Base VELTRON prête sur MySQL !\n";
