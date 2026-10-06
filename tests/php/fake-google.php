<?php
// Stands in for Google's token endpoint during the tests.
header('Content-Type: application/json');
$grant = $_POST['grant_type'] ?? '';
$b64 = fn ($a) => rtrim(strtr(base64_encode(json_encode($a)), '+/', '-_'), '=');
if ($grant === 'authorization_code' && ($_POST['code'] ?? '') === 'good-code') {
    $claims = ['sub' => 'g-123', 'email' => 'alva@example.com', 'email_verified' => true, 'given_name' => 'Alva'];
    echo json_encode([
        'access_token' => 'access-1', 'expires_in' => 3600, 'refresh_token' => 'refresh-1',
        'scope' => 'openid email https://www.googleapis.com/auth/calendar',
        'id_token' => $b64(['alg' => 'none']) . '.' . $b64($claims) . '.sig',
    ]);
    exit;
}
if ($grant === 'refresh_token' && ($_POST['refresh_token'] ?? '') === 'refresh-ok') {
    echo json_encode(['access_token' => 'fresh-access', 'expires_in' => 3599]);
    exit;
}
http_response_code(400);
echo json_encode(['error' => 'invalid_grant']);
