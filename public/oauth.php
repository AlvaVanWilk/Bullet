<?php
// Bullet – sign in with Google.
//
//   oauth.php?start=1   sends the browser to Google
//   oauth.php?code=…    Google sends it back here; the device gets its cookie
//
// The server keeps Google's refresh token, so the calendar stays connected
// without signing in again.

declare(strict_types=1);

require __DIR__ . '/lib/bullet.php';

header('Cache-Control: no-store');

function backToApp(string $note = ''): void
{
    header('Location: ' . appUrl() . ($note !== '' ? '?anmeldung=' . rawurlencode($note) : ''), true, 302);
    exit;
}

try {
    if (!googleConfigured()) {
        backToApp('nicht-eingerichtet');
    }

    if (isset($_GET['start'])) {
        $state = bin2hex(random_bytes(16));
        setAppCookie(STATE_COOKIE, $state, 900);
        $params = [
            'client_id' => setting('google_client_id'),
            'redirect_uri' => redirectUri(),
            'response_type' => 'code',
            'scope' => GOOGLE_SCOPES,
            'access_type' => 'offline',
            'include_granted_scopes' => 'true',
            'prompt' => 'consent',
            'state' => $state,
        ];
        $hint = (string) ($_GET['hint'] ?? '');
        if ($hint !== '' && filter_var($hint, FILTER_VALIDATE_EMAIL)) {
            $params['login_hint'] = $hint;
        }
        $auth = (string) setting('google_auth_url', 'https://accounts.google.com/o/oauth2/v2/auth');
        header('Location: ' . $auth . '?' . http_build_query($params), true, 302);
        exit;
    }

    if (isset($_GET['error'])) {
        backToApp('abgebrochen');
    }

    $code = (string) ($_GET['code'] ?? '');
    $state = (string) ($_GET['state'] ?? '');
    $expected = (string) ($_COOKIE[STATE_COOKIE] ?? '');
    setAppCookie(STATE_COOKIE, '', -1);
    if ($code === '' || $expected === '' || !hash_equals($expected, $state)) {
        backToApp('fehler');
    }

    [$answer, $status] = googlePost(tokenEndpoint(), [
        'code' => $code,
        'client_id' => setting('google_client_id'),
        'client_secret' => setting('google_client_secret'),
        'redirect_uri' => redirectUri(),
        'grant_type' => 'authorization_code',
    ]);
    if ($status !== 200 || empty($answer['id_token'])) {
        error_log('Bullet: token exchange failed: ' . json_encode($answer));
        backToApp('fehler');
    }

    $claims = idTokenClaims((string) $answer['id_token']);
    $sub = (string) ($claims['sub'] ?? '');
    $email = (string) ($claims['email'] ?? '');
    if ($sub === '' || $email === '' || ($claims['email_verified'] ?? false) !== true) {
        backToApp('fehler');
    }
    if (!mayUse($sub, $email)) {
        backToApp('nicht-erlaubt');
    }

    $uid = userId($sub);
    withLock(userFile($uid), function () use ($uid, $sub, $email, $claims, $answer) {
        $user = readJson(userFile($uid)) ?? [];
        $user['sub'] = $sub;
        $user['email'] = $email;
        $user['name'] = (string) ($claims['given_name'] ?? $claims['name'] ?? '');
        $google = $user['google'] ?? [];
        if (!empty($answer['refresh_token'])) {
            $google['refresh_token'] = $answer['refresh_token'];
        }
        $google['access_token'] = $answer['access_token'] ?? '';
        $google['expires_at'] = time() + (int) ($answer['expires_in'] ?? 3600);
        $google['scope'] = $answer['scope'] ?? '';
        $user['google'] = $google;
        writeJson(userFile($uid), $user);
    });

    startSession($uid);
    backToApp();
} catch (Throwable $e) {
    error_log('Bullet: ' . $e->getMessage());
    backToApp('fehler');
}
