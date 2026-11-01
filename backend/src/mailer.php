<?php
declare(strict_types=1);

// =============================================================================
// Envoi d'e-mails Transactionnels (OTP, alertes) et Escalade Propriétaire VELTRON
// (E-mail + WhatsApp). Compatible local sans serveur SMTP ni extension curl.
// =============================================================================

function send_veltron_mail(string $to, string $subject, string $body): bool
{
    $dir = __DIR__ . '/../storage';
    if (!is_dir($dir)) @mkdir($dir, 0775, true);

    $entry = sprintf("[%s] TO: %s | SUBJECT: %s\n%s\n%s\n",
        gmdate('c'), $to, $subject, $body, str_repeat('-', 60));
    @file_put_contents($dir . '/mail.log', $entry, FILE_APPEND | LOCK_EX);
    @file_put_contents(__DIR__ . '/../verification.log', $entry, FILE_APPEND | LOCK_EX);

    if (env('MAIL_MODE', 'log') === 'mail') {
        $from = env('MAIL_FROM', 'no-reply@veltron.app');
        $headers = "From: VELTRON <{$from}>\r\nContent-Type: text/plain; charset=UTF-8\r\n";
        return (bool) @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers);
    }
    return true;
}

function clean_phone_digits(?string $phone): string
{
    return preg_replace('/\D+/', '', (string) $phone) ?: '';
}

/**
 * Alerte immédiatement le propriétaire VELTRON (vous) lorsqu'une demande d'agence
 * échoue aux contrôles automatiques / IA ou présente une anomalie de sécurité.
 */
function alert_platform_owner(string $kind, string $title, string $body, ?int $agencyId = null, array $contact = []): int
{
    $ownerEmail = env('OWNER_EMAIL', 'admin@veltron.test') ?? 'admin@veltron.test';
    $ownerWa = clean_phone_digits(env('OWNER_WHATSAPP', ''));
    $agencyEmail = (string) ($contact['email'] ?? '');
    $agencyPhone = clean_phone_digits((string) ($contact['phone'] ?? ''));

    // Liens directs pour que le propriétaire puisse discuter en 1 clic avec l'agence
    $waAgencyLink = $agencyPhone !== ''
        ? 'https://wa.me/' . $agencyPhone . '?text=' . rawurlencode("Bonjour, ici l'équipe de vérification VELTRON concernant votre demande d'ouverture d'agence ({$title}).")
        : null;
    $mailtoAgencyLink = $agencyEmail !== ''
        ? 'mailto:' . rawurlencode($agencyEmail) . '?subject=' . rawurlencode("VELTRON – Vérification de votre agence")
        : null;

    $mailSent = send_veltron_mail($ownerEmail, "[VELTRON ALERTE] $title", $body . "\n\n"
        . ($agencyEmail ? "E-mail agence : $agencyEmail\n" : '')
        . ($waAgencyLink ? "Discuter sur WhatsApp avec l'agence : $waAgencyLink\n" : ''));

    $waWebhookSent = false;
    $webhook = env('WHATSAPP_WEBHOOK_URL');
    if ($webhook && str_starts_with($webhook, 'https://')) {
        $payload = json_encode([
            'to' => $ownerWa,
            'title' => $title,
            'text' => $body,
            'agency_contact' => $contact,
            'whatsapp_agency_url' => $waAgencyLink,
        ], JSON_UNESCAPED_UNICODE);
        $ctx = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => "Content-Type: application/json\r\n",
                'content' => $payload ?: '{}',
                'timeout' => 5,
                'ignore_errors' => true,
            ],
        ]);
        $resp = @file_get_contents($webhook, false, $ctx);
        $waWebhookSent = $resp !== false;
    }

    $channels = [
        'owner_email' => $ownerEmail,
        'email_logged' => $mailSent,
        'whatsapp_webhook_sent' => $waWebhookSent,
        'agency_email' => $agencyEmail ?: null,
        'agency_phone' => $contact['phone'] ?? null,
        'agency_whatsapp_url' => $waAgencyLink,
        'agency_mailto_url' => $mailtoAgencyLink,
    ];

    q('INSERT INTO platform_alerts (agency_id, kind, title, body, channels) VALUES (?,?,?,?,?)',
        [$agencyId, $kind, cut($title, 190), $body, json_encode($channels, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
    return (int) db()->lastInsertId();
}

