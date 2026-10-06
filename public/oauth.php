<?php
// Bullet – sign in with Google.
//
//   oauth.php?start=1   sends the browser to Google
//   oauth.php?code=…    Google sends it back here; the server keeps Google's
//                       refresh token and hands the app a one-time ticket
//                       (./?ticket=…), which api.php exchanges for the
//                       device's session cookie.
//
// The ticket step exists because on the iPad the sign-in at Google runs in a
// small browser of its own that does not share cookies with the home-screen app.

declare(strict_types=1);

require __DIR__ . '/lib/bullet.php';

header('Cache-Control: no-store');

function backToApp(array $params = []): void
{
    $query = $params ? '?' . http_build_query($params) : '';
    header('Location: ' . appUrl() . $query, true, 302);
    exit;
}

try {
    if (!googleConfigured()) {
        backToApp(['anmeldung' => 'nicht-eingerichtet']);
    }

    if (isset($_GET['start'])) {
        $state = bin2hex(random_bytes(16));
        rememberOnce('state', $state, STATE_SECONDS);
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
        backToApp(['anmeldung' => 'abgebrochen']);
    }

    $code = (string) ($_GET['code'] ?? '');
    $state = (string) ($_GET['state'] ?? '');
    if ($code === '' || takeOnce('state', $state) === null) {
        backToApp(['anmeldung' => 'fehler-sitzung']);
    }

    [$answer, $status] = googlePost(tokenEndpoint(), [
        'code' => $code,
        'client_id' => setting('google_client_id'),
        'client_secret' => setting('google_client_secret'),
        'redirect_uri' => redirectUri(),
        'grant_type' => 'authorization_code',
    ]);
    if ($status !== 200 || empty($answer['id_token'])) {
        $reason = preg_replace('/[^a-z_]/', '', strtolower((string) ($answer['error'] ?? ('http' . $status))));
        error_log('Bullet: token exchange failed: ' . json_encode($answer));
        backToApp(['anmeldung' => 'fehler-google', 'grund' => $reason]);
    }

    $claims = idTokenClaims((string) $answer['id_token']);
    $sub = (string) ($claims['sub'] ?? '');
    $email = (string) ($claims['email'] ?? '');
    if ($sub === '' || $email === '' || ($claims['email_verified'] ?? false) !== true) {
        backToApp(['anmeldung' => 'fehler-konto']);
    }
    if (!mayUse($sub, $email)) {
        backToApp(['anmeldung' => 'nicht-erlaubt']);
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

    // The app picks this up wherever it opens, and gets its own session for it.
    $ticket = bin2hex(random_bytes(24));
    rememberOnce('ticket', $ticket, TICKET_SECONDS, ['uid' => $uid]);
    backToApp(['ticket' => $ticket]);
} catch (Throwable $e) {
    error_log('Bullet: ' . $e->getMessage());
    backToApp(['anmeldung' => 'fehler']);
}
