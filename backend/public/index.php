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

foreach (['catalog', 'auth', 'booking', 'services', 'desk', 'agency', 'agency_workspace', 'chat'] as $module) {
    require __DIR__ . "/../src/routes/$module.php";
}

$method = $_SERVER['REQUEST_METHOD'];
$path = rtrim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '/', '/') ?: '/';

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
    json_out(['error' => 'server', 'message' => 'Erreur interne du serveur.'], 500);
}
