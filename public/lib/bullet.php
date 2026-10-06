<?php
// Bullet – shared server code: settings, files, sign-in sessions, Google.
//
// Everything lives in files below bullet-daten/ next to the app, one folder
// per person. The folder is created on first use and closed to the web by
// an .htaccess file.

declare(strict_types=1);

const SESSION_COOKIE = 'bullet_session';
const STATE_SECONDS = 900;           // time to finish signing in at Google
const TICKET_SECONDS = 120;          // time for the app to pick up a finished sign-in
const SESSION_DAYS = 400;            // browsers keep cookies at most this long
const MAX_SESSIONS = 20;             // devices signed in at the same time
const MAX_BODY_BYTES = 4000000;
const MAX_RECORD_BYTES = 20000;
const MAX_CHANGES = 2000;
const RECORD_TYPES = ['task', 'category', 'entry', 'special', 'settings'];
const GOOGLE_SCOPES = 'openid email profile https://www.googleapis.com/auth/calendar';

function config(): array
{
    static $config = null;
    if ($config === null) {
        $file = dirname(__DIR__) . '/bullet-config.php';
        $loaded = is_file($file) ? require $file : [];
        $config = is_array($loaded) ? $loaded : [];
    }
    return $config;
}

function setting(string $key, $default = null)
{
    $value = config()[$key] ?? null;
    return ($value === null || $value === '') ? $default : $value;
}

function googleConfigured(): bool
{
    return setting('google_client_id') !== null && setting('google_client_secret') !== null;
}

function dataDir(): string
{
    return rtrim((string) setting('data_dir', dirname(__DIR__) . '/bullet-daten'), '/');
}

function ensureDirs(): void
{
    $dir = dataDir();
    foreach ([$dir, $dir . '/users'] as $d) {
        if (!is_dir($d) && !@mkdir($d, 0700, true)) {
            throw new RuntimeException('storage');
        }
    }
    $htaccess = $dir . '/.htaccess';
    if (!file_exists($htaccess)) {
        file_put_contents($htaccess, "Require all denied\nDeny from all\n");
    }
}

// --- files ---------------------------------------------------------------------

function withLock(string $file, callable $work)
{
    ensureDirs();
    $lock = fopen($file . '.lock', 'c');
    if ($lock === false || !flock($lock, LOCK_EX)) {
        throw new RuntimeException('lock');
    }
    try {
        return $work();
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function readJson(string $file): ?array
{
    if (!is_file($file)) {
        return null;
    }
    $data = json_decode((string) file_get_contents($file), true);
    return is_array($data) ? $data : null;
}

function writeJson(string $file, array $data): void
{
    $tmp = $file . '.tmp' . bin2hex(random_bytes(4));
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false || file_put_contents($tmp, $json) === false || !rename($tmp, $file)) {
        @unlink($tmp);
        throw new RuntimeException('write');
    }
}

function userFile(string $uid): string
{
    return dataDir() . '/users/' . $uid . '.json';
}

function recordsFile(string $uid): string
{
    return dataDir() . '/users/' . $uid . '.records.json';
}

// --- addresses and cookies -------------------------------------------------------

function isHttps(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');
}

/** Folder of the app in the address, with a trailing slash ("/bullet/"). */
function appPath(): string
{
    $dir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
    return rtrim($dir, '/') . '/';
}

function appUrl(): string
{
    $base = setting('base_url');
    if ($base !== null) {
        return rtrim((string) $base, '/') . '/';
    }
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return (isHttps() ? 'https://' : 'http://') . $host . appPath();
}

function redirectUri(): string
{
    return appUrl() . 'oauth.php';
}

function setAppCookie(string $name, string $value, int $lifetime): void
{
    setcookie($name, $value, [
        'expires' => $lifetime > 0 ? time() + $lifetime : time() - 3600,
        'path' => appPath(),
        'secure' => isHttps(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

// --- people and sessions ---------------------------------------------------------

function userId(string $googleSub): string
{
    return substr(hash('sha256', 'bullet|' . $googleSub), 0, 24);
}

function allowedEmails(): array
{
    $raw = (string) setting('allowed_emails', '');
    $list = preg_split('/[\s,;]+/', strtolower($raw), -1, PREG_SPLIT_NO_EMPTY);
    return $list ?: [];
}

/**
 * Who may use this copy: the addresses in the settings, or, if none are set,
 * the first Google account that signs in (it is written down as the owner).
 */
function mayUse(string $sub, string $email): bool
{
    $allowed = allowedEmails();
    if ($allowed) {
        return in_array(strtolower($email), $allowed, true);
    }
    $ownerFile = dataDir() . '/owner.json';
    return withLock($ownerFile, function () use ($ownerFile, $sub, $email) {
        $owner = readJson($ownerFile);
        if ($owner === null) {
            writeJson($ownerFile, ['sub' => $sub, 'email' => $email, 'since' => time()]);
            return true;
        }
        return hash_equals((string) $owner['sub'], $sub);
    });
}

/** Start a session for a device and send its cookie. */
function startSession(string $uid): void
{
    $token = bin2hex(random_bytes(32));
    withLock(userFile($uid), function () use ($uid, $token) {
        $user = readJson(userFile($uid)) ?? [];
        $sessions = $user['sessions'] ?? [];
        $sessions[] = [
            'hash' => hash('sha256', $token),
            'created' => time(),
            'seen' => time(),
            'agent' => substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 160),
        ];
        usort($sessions, fn ($a, $b) => $b['seen'] <=> $a['seen']);
        $user['sessions'] = array_slice($sessions, 0, MAX_SESSIONS);
        writeJson(userFile($uid), $user);
    });
    setAppCookie(SESSION_COOKIE, $uid . '.' . $token, SESSION_DAYS * 86400);
}

/** The signed-in person's id, or null. */
function currentUser(): ?string
{
    $cookie = (string) ($_COOKIE[SESSION_COOKIE] ?? '');
    if (!preg_match('/^([a-f0-9]{24})\.([a-f0-9]{64})$/', $cookie, $m)) {
        return null;
    }
    [$_, $uid, $token] = $m;
    $user = readJson(userFile($uid));
    if ($user === null) {
        return null;
    }
    $hash = hash('sha256', $token);
    foreach ($user['sessions'] ?? [] as $session) {
        if (hash_equals((string) $session['hash'], $hash)) {
            if (time() - (int) $session['seen'] > 86400) {
                touchSession($uid, $hash);
            }
            return $uid;
        }
    }
    return null;
}

function touchSession(string $uid, string $hash): void
{
    withLock(userFile($uid), function () use ($uid, $hash) {
        $user = readJson(userFile($uid));
        if ($user === null) {
            return;
        }
        foreach ($user['sessions'] as &$session) {
            if ($session['hash'] === $hash) {
                $session['seen'] = time();
            }
        }
        writeJson(userFile($uid), $user);
    });
}

function endSession(): void
{
    $cookie = (string) ($_COOKIE[SESSION_COOKIE] ?? '');
    if (preg_match('/^([a-f0-9]{24})\.([a-f0-9]{64})$/', $cookie, $m)) {
        [$_, $uid, $token] = $m;
        $hash = hash('sha256', $token);
        if (is_file(userFile($uid))) {
            withLock(userFile($uid), function () use ($uid, $hash) {
                $user = readJson(userFile($uid));
                if ($user === null) {
                    return;
                }
                $user['sessions'] = array_values(array_filter(
                    $user['sessions'] ?? [],
                    fn ($s) => $s['hash'] !== $hash
                ));
                writeJson(userFile($uid), $user);
            });
        }
    }
    setAppCookie(SESSION_COOKIE, '', -1);
}

// --- one-time values ------------------------------------------------------------
//
// The sign-in state and the ticket after signing in are kept on the server,
// not in a cookie: on the iPad, an app on the home screen opens Google in a
// small browser of its own, which does not share cookies with the app.

function onceFile(string $kind): string
{
    return dataDir() . '/once-' . $kind . '.json';
}

function rememberOnce(string $kind, string $value, int $seconds, array $data = []): void
{
    $file = onceFile($kind);
    withLock($file, function () use ($file, $value, $seconds, $data) {
        $all = array_filter(readJson($file) ?? [], fn ($e) => (int) $e['exp'] > time());
        $all[hash('sha256', $value)] = ['exp' => time() + $seconds, 'data' => $data];
        writeJson($file, $all);
    });
}

/** The data stored with a value, once; null if unknown or expired. */
function takeOnce(string $kind, string $value): ?array
{
    if ($value === '' || strlen($value) > 200) {
        return null;
    }
    $file = onceFile($kind);
    return withLock($file, function () use ($file, $value) {
        $all = array_filter(readJson($file) ?? [], fn ($e) => (int) $e['exp'] > time());
        $key = hash('sha256', $value);
        $entry = $all[$key] ?? null;
        unset($all[$key]);
        writeJson($file, $all);
        return $entry === null ? null : (array) $entry['data'];
    });
}

// --- Google ----------------------------------------------------------------------

/** POST a form to Google and return the decoded answer and the HTTP status. */
function googlePost(string $url, array $fields): array
{
    $body = http_build_query($fields);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        ]);
        $raw = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
    } else {
        $context = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => $body,
            'timeout' => 15,
            'ignore_errors' => true,
        ]]);
        $raw = @file_get_contents($url, false, $context);
        $status = 0;
        foreach ($http_response_header ?? [] as $line) {
            if (preg_match('#^HTTP/\S+\s+(\d+)#', $line, $m)) {
                $status = (int) $m[1];
            }
        }
    }
    $data = is_string($raw) ? json_decode($raw, true) : null;
    return [is_array($data) ? $data : [], $status];
}

function tokenEndpoint(): string
{
    return (string) setting('google_token_url', 'https://oauth2.googleapis.com/token');
}

/** The payload of an ID token received straight from Google over TLS. */
function idTokenClaims(string $jwt): array
{
    $parts = explode('.', $jwt);
    if (count($parts) < 2) {
        return [];
    }
    $json = base64_decode(strtr($parts[1], '-_', '+/'), true);
    $claims = $json === false ? null : json_decode($json, true);
    return is_array($claims) ? $claims : [];
}

/** A valid access token for the person's Google calendar, refreshed when needed. */
function googleAccessToken(string $uid): array
{
    return withLock(userFile($uid), function () use ($uid) {
        $user = readJson(userFile($uid)) ?? [];
        $google = $user['google'] ?? [];
        if (!empty($google['access_token']) && (int) ($google['expires_at'] ?? 0) > time() + 120) {
            return ['ok' => true, 'accessToken' => $google['access_token'], 'expiresAt' => (int) $google['expires_at'] * 1000];
        }
        if (empty($google['refresh_token'])) {
            return ['ok' => false, 'error' => 'google'];
        }
        [$answer, $status] = googlePost(tokenEndpoint(), [
            'client_id' => setting('google_client_id'),
            'client_secret' => setting('google_client_secret'),
            'refresh_token' => $google['refresh_token'],
            'grant_type' => 'refresh_token',
        ]);
        if ($status !== 200 || empty($answer['access_token'])) {
            if (($answer['error'] ?? '') === 'invalid_grant') {
                unset($user['google']['refresh_token'], $user['google']['access_token']);
                writeJson(userFile($uid), $user);
                return ['ok' => false, 'error' => 'google'];
            }
            return ['ok' => false, 'error' => 'google_unreachable'];
        }
        $user['google']['access_token'] = $answer['access_token'];
        $user['google']['expires_at'] = time() + (int) ($answer['expires_in'] ?? 3600);
        if (!empty($answer['scope'])) {
            $user['google']['scope'] = $answer['scope'];
        }
        writeJson(userFile($uid), $user);
        return ['ok' => true, 'accessToken' => $answer['access_token'], 'expiresAt' => $user['google']['expires_at'] * 1000];
    });
}

// --- records ---------------------------------------------------------------------

function validRecord($r): bool
{
    if (!is_array($r)) {
        return false;
    }
    if (!is_string($r['id'] ?? null) || !preg_match('/^[A-Za-z0-9_-]{1,64}$/', $r['id'])) {
        return false;
    }
    if (!in_array($r['type'] ?? null, RECORD_TYPES, true)) {
        return false;
    }
    if (!is_int($r['updatedAt'] ?? null) && !is_float($r['updatedAt'] ?? null)) {
        return false;
    }
    return strlen((string) json_encode($r)) <= MAX_RECORD_BYTES;
}

function isNewer(array $incoming, ?array $current): bool
{
    if ($current === null) {
        return true;
    }
    if ($incoming['updatedAt'] != $current['updatedAt']) {
        return $incoming['updatedAt'] > $current['updatedAt'];
    }
    unset($current['_seq']);
    // Same rule as on the devices: on a tie the larger JSON text wins.
    return strcmp(jsonForCompare($incoming), jsonForCompare($current)) > 0;
}

function jsonForCompare(array $r): string
{
    return (string) json_encode($r, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

/** Take the changes a device sends and return everything it has not seen yet. */
function exchangeRecords(string $uid, int $since, array $changes): array
{
    $file = recordsFile($uid);
    return withLock($file, function () use ($file, $since, $changes) {
        $data = readJson($file) ?? ['seq' => 0, 'records' => []];
        $records = $data['records'];
        $seq = (int) $data['seq'];
        $changed = false;
        foreach ($changes as $r) {
            $current = $records[$r['id']] ?? null;
            if (isNewer($r, $current)) {
                $r['_seq'] = ++$seq;
                $records[$r['id']] = $r;
                $changed = true;
            }
        }
        if ($changed) {
            writeJson($file, ['seq' => $seq, 'records' => $records]);
        }
        $out = [];
        foreach ($records as $r) {
            if ((int) $r['_seq'] > $since) {
                unset($r['_seq']);
                $out[] = $r;
            }
        }
        return ['seq' => $seq, 'changes' => $out];
    });
}
