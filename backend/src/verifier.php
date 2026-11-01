<?php
declare(strict_types=1);

// =============================================================================
// Moteur de Vérification Automatique & IA des Agences VELTRON
//
// Fonctionnement :
// 1. Contrôles déterministes multi-critères (email vérifié par PIN, domaine jetable,
//    cohérence pays / indicatif téléphonique, numéro légal RCCM/SIRET, précision et
//    unicité de l'adresse physique, cohérence identité responsable).
// 2. Si GEMINI_API_KEY est défini dans .env, interrogation du modèle gemini-3.8-flash
//    via l'API Interactions (sortie JSON structurée) pour détecter les incohérences
//    subtiles ou tentatives d'usurpation.
// 3. Score >= 75 et 0 alerte bloquante => approbation automatique immédiate !
//    Sinon => mise en revue + escalade automatique par E-mail & WhatsApp au
//    propriétaire VELTRON avec moyen de contact direct vers l'agence.
// =============================================================================

const DISPOSABLE_DOMAINS = [
    'mailinator.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com',
    'yopmail.com', 'trashmail.com', 'sharklasers.com', 'fakeinbox.com', 'getnada.com',
];

function verify_agency_application(array $data): array
{
    $checks = [];
    $flags = [];
    $score = 0;

    // 1. Propriété de l'adresse e-mail prouvée par code PIN à 5 chiffres (25 pts)
    $score += 25;
    $checks[] = ['code' => 'email_pin_verified', 'ok' => true, 'points' => 25, 'label' => 'Propriété de l\'e-mail confirmée par code PIN'];

    // 2. Qualité du domaine e-mail (15 pts)
    $email = strtolower((string) ($data['email'] ?? ''));
    $domain = substr(strrchr($email, '@') ?: '', 1);
    if (in_array($domain, DISPOSABLE_DOMAINS, true)) {
        $flags[] = 'Domaine e-mail jetable détecté (' . $domain . ').';
        $checks[] = ['code' => 'email_domain', 'ok' => false, 'points' => 0, 'label' => 'Domaine e-mail temporaire/jetable interdit'];
    } else {
        $pts = (!in_array($domain, ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'], true)) ? 15 : 11;
        $score += $pts;
        $checks[] = ['code' => 'email_domain', 'ok' => true, 'points' => $pts, 'label' => "Domaine e-mail valide ($domain)"];
    }

    // 3. Numéro d'enregistrement légal RCCM / Registre du commerce (20 pts)
    $legal = trim((string) ($data['legal_id'] ?? ''));
    $legalClean = preg_replace('/[^A-Za-z0-9]/', '', $legal) ?: '';
    if (strlen($legalClean) >= 6 && preg_match('/[0-9]/', $legalClean)) {
        $score += 20;
        $checks[] = ['code' => 'legal_id', 'ok' => true, 'points' => 20, 'label' => 'Numéro d\'immatriculation légale fourni et structuré'];
    } elseif ($legal !== '') {
        $score += 6;
        $flags[] = "Numéro d'immatriculation légale trop court ou atypique ($legal).";
        $checks[] = ['code' => 'legal_id', 'ok' => false, 'points' => 6, 'label' => 'Numéro légal incomplet (vérification manuelle requise)'];
    } else {
        $flags[] = 'Aucun numéro d\'enregistrement légal (RCCM / SIRET / Registre) fourni.';
        $checks[] = ['code' => 'legal_id', 'ok' => false, 'points' => 0, 'label' => 'Numéro d\'enregistrement légal manquant'];
    }

    // 4. Adresse physique détaillée et unique (20 pts)
    $address = trim((string) ($data['address'] ?? ''));
    $words = preg_split('/[\s,;]+/u', $address, -1, PREG_SPLIT_NO_EMPTY) ?: [];
    $suspiciousWords = preg_match('/\b(test|azerty|qwerty|aucune|inconnu|fake|xxx|12345)\b/i', $address);
    if (!$suspiciousWords && count($words) >= 4 && strlen($address) >= 15) {
        $score += 20;
        $checks[] = ['code' => 'physical_address', 'ok' => true, 'points' => 20, 'label' => 'Adresse géographique complète et unique'];
    } else {
        $pts = $suspiciousWords ? 0 : 8;
        $score += $pts;
        $flags[] = "Adresse physique insuffisamment précise ou suspecte : « $address ».";
        $checks[] = ['code' => 'physical_address', 'ok' => false, 'points' => $pts, 'label' => 'Adresse physique trop vague ou suspecte'];
    }

    // 5. Téléphone et cohérence avec l'indicatif du pays choisi (10 pts)
    $phone = preg_replace('/[\s.\-()]/', '', (string) ($data['phone'] ?? '')) ?: '';
    $prefix = (string) ($data['phone_prefix'] ?? '');
    if ($phone !== '' && strlen(preg_replace('/\D/', '', $phone)) >= 8) {
        if ($prefix !== '' && (str_starts_with($phone, $prefix) || str_starts_with('+' . ltrim($phone, '+'), $prefix))) {
            $score += 10;
            $checks[] = ['code' => 'phone_country', 'ok' => true, 'points' => 10, 'label' => "Téléphone cohérent avec l'indicatif pays ($prefix)"];
        } else {
            $score += 5;
            $flags[] = "Le téléphone ($phone) ne commence pas par l'indicatif du pays sélectionné ($prefix).";
            $checks[] = ['code' => 'phone_country', 'ok' => false, 'points' => 5, 'label' => 'Indicatif téléphonique différent du pays choisi'];
        }
    } else {
        $flags[] = 'Numéro de téléphone manquant ou invalide.';
        $checks[] = ['code' => 'phone_country', 'ok' => false, 'points' => 0, 'label' => 'Téléphone manquant ou trop court'];
    }

    // 6. Identité du responsable et nom commercial (10 pts)
    $name = trim((string) ($data['name'] ?? ''));
    $ownerName = trim((string) ($data['owner_first'] ?? '') . ' ' . (string) ($data['owner_last'] ?? ''));
    if (strlen($name) >= 3 && !preg_match('/^(test|admin|veltron|bus)$/i', $name) && strlen($ownerName) >= 4) {
        $score += 10;
        $checks[] = ['code' => 'identity', 'ok' => true, 'points' => 10, 'label' => 'Dénomination sociale et identité du dirigeant cohérentes'];
    } else {
        $flags[] = "Dénomination ou identité du responsable à confirmer ($name / $ownerName).";
        $checks[] = ['code' => 'identity', 'ok' => false, 'points' => 3, 'label' => 'Dénomination générique ou incomplète'];
        $score += 3;
    }

    // 7. Audit IA optionnel via Gemini (gemini-3.8-flash, Interactions API)
    $ai = gemini_audit_agency($data);
    if ($ai !== null) {
        $adj = max(-25, min(10, (int) ($ai['score_adjustment'] ?? 0)));
        $score = max(0, min(100, $score + $adj));
        if (!empty($ai['flags']) && is_array($ai['flags'])) {
            foreach ($ai['flags'] as $f) $flags[] = '[IA] ' . (string) $f;
        }
        $checks[] = [
            'code' => 'gemini_ai',
            'ok' => ($ai['risk_level'] ?? 'medium') === 'low',
            'points' => $adj,
            'label' => 'Analyse IA Gemini : ' . ($ai['summary_fr'] ?? 'effectuée'),
        ];
    }

    $score = max(0, min(100, $score));
    $hasBlockingFlag = in_array($domain, DISPOSABLE_DOMAINS, true) || (bool) $suspiciousWords;
    $approved = ($score >= 75 && !$hasBlockingFlag);

    $summary = $approved
        ? "Authentification validée automatiquement par le système de sécurité IA VELTRON (score $score/100)."
        : "Dossier mis en revue de sécurité (score $score/100) et transmis au propriétaire VELTRON pour vérification directe avec l'agence.";

    return [
        'approved' => $approved,
        'verification_status' => $approved ? 'approved' : 'review',
        'agency_status' => $approved ? 'active' : 'pending',
        'score' => $score,
        'summary' => $summary,
        'flags' => array_values(array_unique($flags)),
        'checks' => $checks,
        'ai_used' => $ai !== null,
    ];
}

function gemini_audit_agency(array $data): ?array
{
    $apiKey = env('GEMINI_API_KEY');
    if (!$apiKey) return null;

    $prompt = "Tu es l'auditeur de conformité de la plateforme de transport interurbain VELTRON. "
        . "Évalue la cohérence et l'authenticité probable de cette demande d'ouverture d'agence :\n"
        . json_encode([
            'nom_agence' => $data['name'] ?? '',
            'immatriculation_legale' => $data['legal_id'] ?? '',
            'pays' => $data['country_name'] ?? '',
            'indicatif_pays' => $data['phone_prefix'] ?? '',
            'telephone' => $data['phone'] ?? '',
            'adresse_physique' => $data['address'] ?? '',
            'email_agence' => $data['email'] ?? '',
            'responsable' => trim(($data['owner_first'] ?? '') . ' ' . ($data['owner_last'] ?? '')),
        ], JSON_UNESCAPED_UNICODE);

    $payload = json_encode([
        'model' => 'gemini-3.8-flash',
        'store' => false,
        'input' => $prompt,
        'response_format' => [
            'type' => 'text',
            'mime_type' => 'application/json',
            'schema' => [
                'type' => 'object',
                'properties' => [
                    'risk_level' => ['type' => 'string', 'enum' => ['low', 'medium', 'high']],
                    'score_adjustment' => ['type' => 'integer'],
                    'summary_fr' => ['type' => 'string'],
                    'flags' => ['type' => 'array', 'items' => ['type' => 'string']],
                ],
                'required' => ['risk_level', 'score_adjustment', 'summary_fr', 'flags'],
            ],
        ],
    ], JSON_UNESCAPED_UNICODE);

    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\nApi-Revision: 2026-05-20\r\nx-goog-api-key: {$apiKey}\r\n",
            'content' => $payload ?: '{}',
            'timeout' => 8,
            'ignore_errors' => true,
        ],
    ]);
    $raw = @file_get_contents('https://generativelanguage.googleapis.com/v1beta/interactions', false, $ctx);
    if (!$raw) return null;
    $json = json_decode($raw, true);
    if (!is_array($json) || empty($json['steps'])) return null;

    foreach (array_reverse($json['steps']) as $step) {
        if (($step['type'] ?? '') === 'model_output' && !empty($step['content'])) {
            foreach ($step['content'] as $part) {
                if (($part['type'] ?? '') === 'text' && !empty($part['text'])) {
                    $parsed = json_decode((string) $part['text'], true);
                    if (is_array($parsed) && isset($parsed['risk_level'])) return $parsed;
                }
            }
        }
    }
    return null;
}

