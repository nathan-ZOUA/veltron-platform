<?php
declare(strict_types=1);

// Point d'entrée unique de l'API VELTRON.
// Lancer en local :  php -S 127.0.0.1:8000 -t public
require __DIR__ . '/../src/core.php';
require __DIR__ . '/../src/verifier.php';

security_headers();
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$ROUTES = [];
function route(string $method, string $pattern, callable $handler): void
{
    global $ROUTES;
    $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?<$1>[^/]+)', $pattern) . '$#';
    $ROUTES[] = [$method, $regex, $handler];
}

foreach (['catalog', 'auth', 'booking', 'services', 'desk', 'agency', 'agency_workspace', 'chat', 'boarding', 'ai_ange'] as $module) {
    require __DIR__ . "/../src/routes/$module.php";
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$rawPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$path = rtrim($rawPath, '/') ?: '/';

// En production (frontend compilé dans public/), servir les fichiers statiques et le routeur SPA React
if (!str_starts_with($path, '/api')) {
    $candidate = realpath(__DIR__ . $rawPath);
    if ($candidate && str_starts_with($candidate, realpath(__DIR__)) && is_file($candidate) && basename($candidate) !== 'index.php') {
        if (PHP_SAPI === 'cli-server') {
            return false;
        }
        $ext = strtolower(pathinfo($candidate, PATHINFO_EXTENSION));
        $mimes = [
            'html' => 'text/html; charset=utf-8',
            'css'  => 'text/css; charset=utf-8',
            'js'   => 'application/javascript; charset=utf-8',
            'json' => 'application/json; charset=utf-8',
            'svg'  => 'image/svg+xml',
            'png'  => 'image/png',
            'jpg'  => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'webp' => 'image/webp',
            'mp4'  => 'video/mp4',
            'ico'  => 'image/x-icon',
            'woff2'=> 'font/woff2',
        ];
        header('Content-Type: ' . ($mimes[$ext] ?? 'application/octet-stream'));
        readfile($candidate);
        exit;
    }
    $spaIndex = __DIR__ . '/index.html';
    if (is_file($spaIndex)) {
        header('Content-Type: text/html; charset=utf-8');
        readfile($spaIndex);
        exit;
    }
}

try {
    foreach ($ROUTES as [$m, $regex, $handler]) {
        if ($m === $method && preg_match($regex, $path, $matches)) {
            $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
            $handler($params);
            exit;
        }
    }
    fail(404, 'not_found', 'Route introuvable.');
} catch (HttpError $e) {
    json_out(array_merge(['error' => $e->errorCode, 'message' => $e->getMessage()], $e->extra), $e->status);
} catch (Throwable $e) {
    error_log('[VELTRON] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    $detail = is_local() ? ['detail' => $e->getMessage(), 'file' => $e->getFile() . ':' . $e->getLine()] : [];
    json_out(array_merge(['error' => 'server', 'message' => 'Erreur interne du serveur.'], $detail), 500);
}
