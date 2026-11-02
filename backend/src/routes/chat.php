<?php
declare(strict_types=1);

// =============================================================================
// Messagerie d'équipe interne à chaque agence (en clair pour tous les membres
// d'une même agence, isolée strictement par agency_id côté serveur).
// =============================================================================

const CHAT_THEMES = ['aurora', 'whatsapp', 'instagram', 'ocean', 'savane', 'minimal'];

function require_group_member(int $groupId): array
{
    $s = require_agency();
    $g = one('SELECT g.* FROM chat_groups g WHERE g.id = ? AND g.agency_id = ?', [$groupId, $s['agency_id']])
        ?? fail(403, 'not_member', 'Ce salon n\'appartient pas à votre agence.');
    // Tout membre actif de l'agence a accès aux échanges de son agence
    q('INSERT IGNORE INTO chat_members (group_id, user_id, is_admin) VALUES (?,?,?)',
        [$g['id'], $s['id'], $s['role'] === 'owner' ? 1 : 0]);
    return [$s, $g];
}

// Publier sa clé publique ECDH P-256 (la clé privée reste dans le navigateur)
route('POST', '/api/agency/chat/keys', function () {
    $s = require_agency();
    $in = input();
    $jwk = $in['public_jwk'] ?? null;
    $fp = strtolower(trim((string) ($in['fingerprint'] ?? '')));
    $jwkStr = is_array($jwk) ? json_encode($jwk) : (string) $jwk;

    if (!$jwkStr || !preg_match('/^[0-9a-f]{64}$/', $fp)) {
        fail(422, 'invalid_key', 'Clé publique ECDH invalide.');
    }
    q('REPLACE INTO chat_user_keys (user_id, agency_id, public_jwk, fingerprint) VALUES (?,?,?,?)',
        [$s['id'], $s['agency_id'], $jwkStr, $fp]);
    json_out(['ok' => true]);
});

// État complet des groupes de l'utilisateur dans son agence + clés publiques des collègues
route('GET', '/api/agency/chat/bootstrap', function () {
    $s = require_agency();

    // S'assure que tous les membres actifs de l'agence ont accès aux salons de l'agence
    $gen = one("SELECT id FROM chat_groups WHERE agency_id = ? AND kind = 'general' LIMIT 1", [$s['agency_id']]);
    if (!$gen) {
        q("INSERT INTO chat_groups (agency_id, name, description, kind, theme, created_by)
           VALUES (?, 'Équipe Générale', 'Canal interne de toute l''agence', 'general', 'aurora', ?)",
            [$s['agency_id'], $s['id']]);
        $gid = (int) db()->lastInsertId();
        q('INSERT IGNORE INTO chat_members (group_id, user_id, is_admin)
           SELECT ?, user_id, role = "owner" FROM agency_staff WHERE agency_id = ? AND status = "active"',
            [$gid, $s['agency_id']]);
    } else {
        q('INSERT IGNORE INTO chat_members (group_id, user_id, is_admin)
           SELECT ?, user_id, role = "owner" FROM agency_staff WHERE agency_id = ? AND status = "active"',
            [$gen['id'], $s['agency_id']]);
    }

    // Rattache le membre courant à tous les salons de son agence pour qu'aucun message d'équipe ne soit masqué
    q('INSERT IGNORE INTO chat_members (group_id, user_id, is_admin)
       SELECT id, ?, ? FROM chat_groups WHERE agency_id = ?',
        [$s['id'], $s['role'] === 'owner' ? 1 : 0, $s['agency_id']]);

    $groups = all("SELECT g.id, g.name, g.description, g.kind, g.theme,
                          COALESCE(m.is_admin, 0) AS is_admin, COALESCE(m.last_read_id, 0) AS last_read_id,
                          (SELECT COUNT(*) FROM chat_messages cm WHERE cm.group_id = g.id AND cm.id > COALESCE(m.last_read_id, 0)) AS unread
                   FROM chat_groups g
                   LEFT JOIN chat_members m ON m.group_id = g.id AND m.user_id = ?
                   WHERE g.agency_id = ?
                   ORDER BY FIELD(g.kind, 'general','custom'), g.id ASC", [$s['id'], $s['agency_id']]);

    foreach ($groups as &$g) {
        $g['id'] = (int) $g['id'];
        $g['is_admin'] = (bool) $g['is_admin'];
        $g['unread'] = (int) $g['unread'];
        $members = all("SELECT u.id AS user_id, u.first_name, u.last_name, st.role, st.job_title,
                               k.public_jwk, k.fingerprint, d.availability, d.mood
                        FROM chat_members cm
                        JOIN users u ON u.id = cm.user_id
                        JOIN agency_staff st ON st.agency_id = ? AND st.user_id = u.id AND st.status = 'active'
                        LEFT JOIN chat_user_keys k ON k.user_id = u.id AND k.agency_id = ?
                        LEFT JOIN drivers d ON d.agency_id = ? AND d.user_id = u.id
                        WHERE cm.group_id = ?
                        ORDER BY u.first_name",
            [$s['agency_id'], $s['agency_id'], $s['agency_id'], $g['id']]);
        foreach ($members as &$mb) {
            $mb['user_id'] = (int) $mb['user_id'];
            $mb['public_jwk'] = $mb['public_jwk'] ? json_decode($mb['public_jwk'], true) : null;
        }
        $g['members'] = $members;
    }

    // Répertoire de tous les collègues actifs pour créer un nouveau groupe
    $colleagues = all("SELECT u.id AS user_id, u.first_name, u.last_name, st.role
                       FROM agency_staff st JOIN users u ON u.id = st.user_id
                       WHERE st.agency_id = ? AND st.status = 'active' ORDER BY u.first_name", [$s['agency_id']]);

    json_out(['groups' => $groups, 'colleagues' => $colleagues, 'themes' => CHAT_THEMES]);
});

// Créer un nouveau salon thématique dans l'agence
route('POST', '/api/agency/chat/groups', function () {
    $s = require_agency(['owner', 'manager', 'secretary']);
    $in = input();
    $name = str_in($in['name'] ?? '', 80);
    $desc = str_in($in['description'] ?? '', 190) ?: null;
    $theme = in_array($in['theme'] ?? '', CHAT_THEMES, true) ? $in['theme'] : 'aurora';
    $memberIds = is_array($in['member_ids'] ?? null) ? array_map('intval', $in['member_ids']) : [];
    $memberIds[] = (int) $s['id'];
    $memberIds = array_values(array_unique($memberIds));

    if ($name === '') fail(422, 'invalid_name', 'Nom du groupe obligatoire.');

    $gid = transaction(function () use ($s, $name, $desc, $theme, $memberIds) {
        q("INSERT INTO chat_groups (agency_id, name, description, kind, theme, created_by) VALUES (?,?,?, 'custom', ?,?)",
            [$s['agency_id'], $name, $desc, $theme, $s['id']]);
        $gid = (int) db()->lastInsertId();
        foreach ($memberIds as $uid) {
            if (one("SELECT 1 FROM agency_staff WHERE agency_id = ? AND user_id = ? AND status = 'active'", [$s['agency_id'], $uid])) {
                q('INSERT IGNORE INTO chat_members (group_id, user_id, is_admin) VALUES (?,?,?)',
                    [$gid, $uid, $uid === (int) $s['id'] ? 1 : 0]);
            }
        }
        q("INSERT INTO chat_messages (group_id, sender_user_id, kind, ciphertext) VALUES (?,?, 'system', ?)",
            [$gid, $s['id'], "Salon « $name » ouvert pour l'équipe de l'agence."]);
        return $gid;
    });

    json_out(['id' => $gid], 201);
});

// Changer le thème visuel du groupe
route('POST', '/api/agency/chat/groups/{id}/theme', function (array $p) {
    [$s, $g] = require_group_member((int) $p['id']);
    $theme = (string) (input()['theme'] ?? '');
    if (!in_array($theme, CHAT_THEMES, true)) fail(422, 'invalid_theme', 'Thème inconnu.');

    q('UPDATE chat_groups SET theme = ? WHERE id = ?', [$theme, $g['id']]);
    q("INSERT INTO chat_messages (group_id, sender_user_id, kind, ciphertext) VALUES (?,?, 'system', ?)",
        [$g['id'], $s['id'], "{$s['first_name']} a changé le thème du groupe en « {$theme} »."]);
    json_out(['ok' => true, 'theme' => $theme]);
});

// Récupérer les enveloppes de clés de groupe destinées à l'utilisateur courant
route('GET', '/api/agency/chat/groups/{id}/keys', function (array $p) {
    [$s, $g] = require_group_member((int) $p['id']);

    $latest = one('SELECT MAX(version) AS v FROM chat_group_keys WHERE group_id = ?', [$g['id']]);
    $latestVersion = (int) ($latest['v'] ?? 0);

    $envelopes = all('SELECT version, recipient_fingerprint, sender_user_id, sender_public_jwk, iv, wrapped_key
                      FROM chat_key_envelopes
                      WHERE group_id = ? AND user_id = ? ORDER BY version ASC', [$g['id'], $s['id']]);
    foreach ($envelopes as &$e) {
        $e['version'] = (int) $e['version'];
        $e['sender_public_jwk'] = json_decode($e['sender_public_jwk'], true);
    }

    // Membres qui ont publié une clé publique mais n'ont pas encore reçu l'enveloppe de la version courante
    $missing = [];
    if ($latestVersion > 0) {
        $missing = all("SELECT k.user_id, k.public_jwk, k.fingerprint
                        FROM chat_members cm
                        JOIN chat_user_keys k ON k.user_id = cm.user_id AND k.agency_id = ?
                        WHERE cm.group_id = ?
                          AND NOT EXISTS (
                              SELECT 1 FROM chat_key_envelopes env
                              WHERE env.group_id = cm.group_id AND env.version = ?
                                AND env.user_id = k.user_id AND env.recipient_fingerprint = k.fingerprint
                          )", [$s['agency_id'], $g['id'], $latestVersion]);
        foreach ($missing as &$m) {
            $m['user_id'] = (int) $m['user_id'];
            $m['public_jwk'] = json_decode($m['public_jwk'], true);
        }
    }

    json_out([
        'latest_version' => $latestVersion,
        'envelopes' => $envelopes,
        'missing_members' => $missing,
    ]);
});

// Enregistrer une nouvelle clé de groupe (ou partager la version courante aux nouveaux membres)
route('POST', '/api/agency/chat/groups/{id}/keys', function (array $p) {
    [$s, $g] = require_group_member((int) $p['id']);
    $in = input();
    $envelopes = $in['envelopes'] ?? [];
    if (!is_array($envelopes) || count($envelopes) === 0) fail(422, 'empty_envelopes', 'Aucune enveloppe de clé.');

    $version = isset($in['version']) ? (int) $in['version'] : 0;

    $ver = transaction(function () use ($s, $g, $envelopes, $version) {
        if ($version <= 0) {
            $max = (int) (one('SELECT COALESCE(MAX(version), 0) AS v FROM chat_group_keys WHERE group_id = ? FOR UPDATE', [$g['id']])['v'] ?? 0);
            $version = $max + 1;
            q('INSERT INTO chat_group_keys (group_id, version, created_by) VALUES (?,?,?)', [$g['id'], $version, $s['id']]);
        }
        foreach ($envelopes as $env) {
            $uid = (int) ($env['user_id'] ?? 0);
            $fp = strtolower((string) ($env['recipient_fingerprint'] ?? ''));
            $senderJwk = is_array($env['sender_public_jwk'] ?? null) ? json_encode($env['sender_public_jwk']) : (string) ($env['sender_public_jwk'] ?? '');
            $iv = (string) ($env['iv'] ?? '');
            $wrapped = (string) ($env['wrapped_key'] ?? '');
            if ($uid > 0 && $fp !== '' && $senderJwk !== '' && $iv !== '' && $wrapped !== '') {
                q('REPLACE INTO chat_key_envelopes (group_id, version, user_id, recipient_fingerprint, sender_user_id, sender_public_jwk, iv, wrapped_key)
                   VALUES (?,?,?,?,?,?,?,?)',
                    [$g['id'], $version, $uid, $fp, $s['id'], $senderJwk, $iv, $wrapped]);
            }
        }
        return $version;
    });

    json_out(['version' => $ver], 201);
});

// Lire les messages en clair d'un salon de l'agence
route('GET', '/api/agency/chat/groups/{id}/messages', function (array $p) {
    [$s, $g] = require_group_member((int) $p['id']);
    $after = (int) ($_GET['after'] ?? 0);

    $msgs = all("SELECT m.id, m.sender_user_id, m.kind, m.key_version, m.iv, m.ciphertext, m.created_at,
                        u.first_name, u.last_name, st.role
                 FROM chat_messages m
                 JOIN users u ON u.id = m.sender_user_id
                 LEFT JOIN agency_staff st ON st.agency_id = ? AND st.user_id = m.sender_user_id
                 WHERE m.group_id = ? AND m.id > ?
                 ORDER BY m.id ASC LIMIT 120", [$s['agency_id'], $g['id'], $after]);

    $maxId = 0;
    foreach ($msgs as &$m) {
        $m['id'] = (int) $m['id'];
        $m['sender_user_id'] = (int) $m['sender_user_id'];
        $m['key_version'] = $m['key_version'] !== null ? (int) $m['key_version'] : null;
        $m['text'] = (string) $m['ciphertext'];
        $m['created_at'] = str_replace(' ', 'T', (string) $m['created_at']) . 'Z';
        if ($m['id'] > $maxId) $maxId = $m['id'];
    }
    if ($maxId > 0) {
        q('UPDATE chat_members SET last_read_id = GREATEST(last_read_id, ?) WHERE group_id = ? AND user_id = ?',
            [$maxId, $g['id'], $s['id']]);
    }

    $reads = all('SELECT user_id, last_read_id FROM chat_members WHERE group_id = ?', [$g['id']]);
    json_out(['theme' => $g['theme'], 'messages' => $msgs, 'reads' => $reads]);
});

// Envoyer un message en clair visible par tous les membres de l'agence
route('POST', '/api/agency/chat/groups/{id}/messages', function (array $p) {
    [$s, $g] = require_group_member((int) $p['id']);
    $in = input();
    $text = trim((string) ($in['text'] ?? $in['body'] ?? $in['ciphertext'] ?? ''));

    if ($text === '' || strlen($text) > 10000) {
        fail(422, 'invalid_message', 'Message vide ou trop long.');
    }

    q("INSERT INTO chat_messages (group_id, sender_user_id, kind, key_version, iv, ciphertext)
       VALUES (?, ?, 'text', NULL, NULL, ?)", [$g['id'], $s['id'], $text]);
    $msgId = (int) db()->lastInsertId();
    q('UPDATE chat_members SET last_read_id = GREATEST(last_read_id, ?) WHERE group_id = ? AND user_id = ?',
        [$msgId, $g['id'], $s['id']]);

    json_out(['id' => $msgId, 'text' => $text], 201);
});

// Demande d'évolution de tableau de bord envoyée dans la discussion d'équipe
route('POST', '/api/agency/chat/request-modules', function () {
    $s = require_agency();
    $in = input();
    $modules = $in['modules'] ?? [];
    if (!is_array($modules) || count($modules) === 0) fail(422, 'invalid_modules', 'Sélectionnez au moins un module.');

    $allowed = ['desk', 'boarding', 'fleet', 'tracking', 'rentals', 'sales', 'analytics', 'settings', 'cash_journal'];
    $filtered = array_values(array_intersect($allowed, $modules));

    // Récupérer le groupe général de l'agence
    $gen = one("SELECT id FROM chat_groups WHERE agency_id = ? AND kind = 'general' LIMIT 1", [$s['agency_id']]);
    if (!$gen) {
        q("INSERT INTO chat_groups (agency_id, name, description, kind, theme, created_by)
           VALUES (?, 'Équipe Générale', 'Canal interne de toute l''agence', 'general', 'aurora', ?)",
            [$s['agency_id'], $s['id']]);
        $gid = (int) db()->lastInsertId();
    } else {
        $gid = (int) $gen['id'];
    }

    $payload = [
        'applicant_id' => $s['id'],
        'applicant_name' => trim($s['first_name'] . ' ' . $s['last_name']),
        'applicant_role' => $s['role'],
        'modules' => $filtered,
        'status' => 'pending',
        'decided_by' => null,
        'decided_by_name' => null,
        'created_at' => gmdate('Y-m-d H:i:s'),
    ];

    q("INSERT INTO chat_messages (group_id, sender_user_id, kind, key_version, iv, ciphertext)
       VALUES (?, ?, 'module_request', NULL, NULL, ?)", [$gid, $s['id'], json_encode($payload)]);
    $msgId = (int) db()->lastInsertId();

    q('UPDATE chat_members SET last_read_id = GREATEST(last_read_id, ?) WHERE group_id = ? AND user_id = ?',
        [$msgId, $gid, $s['id']]);

    audit((int) $s['id'], $s['agency_id'], 'staff.dashboard_module_request', 'user', $s['id'], ['modules' => $filtered]);

    json_out(['ok' => true, 'message_id' => $msgId, 'payload' => $payload], 201);
});

// Répondre à une demande d'évolution de tableau de bord (Administrateur uniquement)
route('POST', '/api/agency/chat/module-request/{id}/respond', function (array $p) {
    $s = require_agency(['owner']);
    $msgId = (int) $p['id'];
    $in = input();
    $decision = (string) ($in['decision'] ?? ''); // 'approve' ou 'reject'

    $msg = one("SELECT m.*, g.agency_id FROM chat_messages m
                JOIN chat_groups g ON g.id = m.group_id
                WHERE m.id = ? AND g.agency_id = ? AND m.kind = 'module_request'",
        [$msgId, $s['agency_id']]) ?? fail(404, 'not_found', 'Demande introuvable.');

    $payload = json_decode($msg['ciphertext'], true);
    if (!is_array($payload)) fail(422, 'invalid_payload', 'Données de la demande corrompues.');

    if ($decision === 'approve') {
        $payload['status'] = 'approved';
        $payload['decided_by'] = $s['id'];
        $payload['decided_by_name'] = trim($s['first_name'] . ' ' . $s['last_name']);
        $payload['decided_at'] = gmdate('Y-m-d H:i:s');

        // Mettre à jour les modules réels de l'agent dans agency_staff
        q("UPDATE agency_staff SET dashboard_modules = ? WHERE agency_id = ? AND user_id = ?",
            [json_encode($payload['modules']), $s['agency_id'], (int) $payload['applicant_id']]);

        audit((int) $s['id'], $s['agency_id'], 'staff.dashboard_module_approved', 'user', (int) $payload['applicant_id'], [
            'modules' => $payload['modules']
        ]);
    } elseif ($decision === 'reject') {
        $payload['status'] = 'rejected';
        $payload['decided_by'] = $s['id'];
        $payload['decided_by_name'] = trim($s['first_name'] . ' ' . $s['last_name']);
        $payload['decided_at'] = gmdate('Y-m-d H:i:s');

        audit((int) $s['id'], $s['agency_id'], 'staff.dashboard_module_rejected', 'user', (int) $payload['applicant_id']);
    } else {
        fail(422, 'invalid_decision', 'Décision invalide (approve ou reject).');
    }

    q("UPDATE chat_messages SET ciphertext = ? WHERE id = ?", [json_encode($payload), $msgId]);

    json_out(['ok' => true, 'status' => $payload['status'], 'payload' => $payload]);
});

