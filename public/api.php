<?php
// Bullet – the app's server. Requests are JSON with a field "action":
//
//   status                 -> { ok, configured, user: { email, name } | null }
//   redeem { ticket }      -> { ok, user }  (after oauth.php: starts this device's session)
//   token                  -> { ok, accessToken, expiresAt }  (Google calendar)
//   sync { since, changes } -> { ok, seq, changes }
//   logout                 -> { ok }
//   family                 -> { ok, admins, family }        (admins only)
//   family_add { email }   -> { ok, admins, family }        (admins only)
//   family_remove { email } -> { ok, admins, family }       (admins only)
//   inbox                  -> { ok, key | null }  (key for briefkasten.php)
//   inbox_new              -> { ok, key }         (a new key; the old one stops working)
//   inbox_off              -> { ok, key: null }
//   photo_put { id, data }  -> { ok }   (data: the JPEG as base64)
//   photo_delete { id }     -> { ok }
//   GET ?action=photo&id=   -> the JPEG
//
// Everything but "status" needs a signed-in device (cookie from oauth.php).

declare(strict_types=1);

require __DIR__ . '/lib/bullet.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function reply(int $status, array $body): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(int $status, string $error): void
{
    reply($status, ['ok' => false, 'error' => $error]);
}

function request(): array
{
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        return ['action' => $_GET['action'] ?? 'status', 'id' => $_GET['id'] ?? ''];
    }
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
    if ($raw === false || strlen($raw) > MAX_BODY_BYTES) {
        fail(413, 'too_large');
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        fail(400, 'bad_json');
    }
    // A custom header cannot be sent by a foreign page without asking first.
    if (($_SERVER['HTTP_X_BULLET'] ?? '') !== '1') {
        fail(403, 'header');
    }
    return $data;
}

function userInfo(string $uid): array
{
    $user = readJson(userFile($uid)) ?? [];
    return [
        'email' => $user['email'] ?? '',
        'name' => $user['name'] ?? '',
        'google' => !empty($user['google']['refresh_token']),
        'admin' => isAdmin((string) ($user['sub'] ?? ''), (string) ($user['email'] ?? '')),
    ];
}

function familyReply(): void
{
    $admins = allowedEmails();
    if (!$admins) {
        $owner = readJson(ownerFile());
        $admins = $owner ? [strtolower((string) $owner['email'])] : [];
    }
    reply(200, ['ok' => true, 'admins' => $admins, 'family' => familyEmails()]);
}

try {
    $request = request();
    $action = (string) ($request['action'] ?? '');

    if ($action === 'status') {
        $uid = currentUser();
        reply(200, [
            'ok' => true,
            'app' => 'bullet',
            'configured' => googleConfigured(),
            'user' => $uid ? userInfo($uid) : null,
        ]);
    }

    if ($action === 'redeem') {
        $data = takeOnce('ticket', (string) ($request['ticket'] ?? ''));
        if ($data === null || !is_string($data['uid'] ?? null) || !is_file(userFile($data['uid']))) {
            fail(403, 'ticket');
        }
        startSession($data['uid']);
        reply(200, ['ok' => true, 'user' => userInfo($data['uid'])]);
    }

    // Only for the automatic tests on a developer machine (PHP's own server).
    if ($action === 'testlogin') {
        if (PHP_SAPI !== 'cli-server' || setting('test_mode') !== true) {
            fail(404, 'unknown_action');
        }
        $email = (string) ($request['email'] ?? 'test@example.com');
        $sub = 'test-' . $email;
        if (!mayUse($sub, $email)) {
            fail(403, 'not_allowed');
        }
        $uid = userId($sub);
        withLock(userFile($uid), function () use ($uid, $sub, $email, $request) {
            $user = readJson(userFile($uid)) ?? [];
            $user['sub'] = $sub;
            $user['email'] = $email;
            $user['name'] = 'Test';
            if (isset($request['refresh_token'])) {
                $user['google']['refresh_token'] = $request['refresh_token'];
            }
            writeJson(userFile($uid), $user);
        });
        startSession($uid);
        reply(200, ['ok' => true]);
    }

    $uid = currentUser();
    if ($uid === null) {
        fail(401, 'login');
    }

    switch ($action) {
        case 'token':
            if (!googleConfigured()) {
                fail(503, 'not_configured');
            }
            $result = googleAccessToken($uid);
            reply($result['ok'] ? 200 : 409, $result);

        case 'sync':
            $since = $request['since'] ?? 0;
            $changes = $request['changes'] ?? [];
            if (!is_int($since) || $since < 0 || !is_array($changes) || count($changes) > MAX_CHANGES) {
                fail(400, 'bad_request');
            }
            foreach ($changes as $record) {
                if (!validRecord($record)) {
                    fail(400, 'bad_record');
                }
            }
            $result = exchangeRecords($uid, $since, array_values($changes));
            reply(200, ['ok' => true] + $result);

        case 'logout':
            endSession();
            reply(200, ['ok' => true]);

        case 'family':
        case 'family_add':
        case 'family_remove':
            if (!userInfo($uid)['admin']) {
                fail(403, 'admin');
            }
            if ($action !== 'family') {
                $email = strtolower(trim((string) ($request['email'] ?? '')));
                if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 200) {
                    fail(400, 'email');
                }
                changeFamily(fn ($list) => $action === 'family_add'
                    ? array_merge($list, [$email])
                    : array_filter($list, fn ($e) => $e !== $email));
            }
            familyReply();

        case 'photo':
            $file = photoFile($uid, (string) ($request['id'] ?? ''));
            if ($file === null || !is_file($file)) {
                fail(404, 'photo');
            }
            // a photo never changes under its id
            header('Content-Type: image/jpeg');
            header('Cache-Control: private, max-age=31536000, immutable');
            header('Content-Length: ' . filesize($file));
            readfile($file);
            exit;

        case 'photo_put':
            $bytes = base64_decode((string) ($request['data'] ?? ''), true);
            if ($bytes === false || !putPhoto($uid, (string) ($request['id'] ?? ''), $bytes)) {
                fail(400, 'photo');
            }
            reply(200, ['ok' => true]);

        case 'photo_delete':
            deletePhoto($uid, (string) ($request['id'] ?? ''));
            reply(200, ['ok' => true]);

        case 'inbox':
            reply(200, ['ok' => true, 'key' => inboxKey($uid)]);

        case 'inbox_new':
        case 'inbox_off':
            reply(200, ['ok' => true, 'key' => setInboxKey($uid, $action === 'inbox_new')]);

        default:
            fail(404, 'unknown_action');
    }
} catch (Throwable $e) {
    error_log('Bullet: ' . $e->getMessage());
    fail(500, 'server');
}
