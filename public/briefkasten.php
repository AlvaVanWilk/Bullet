<?php
// Bullet's letterbox: tasks sent from elsewhere, e.g. by Siri through a
// shortcut on the iPhone ("Hey Siri, Bullet"). POST, as JSON or as a form:
//
//   { "schluessel": "<the person's key>", "text": "Milch kaufen" }
//
// Each line becomes a task at the end of that person's master list; "wichtig"
// or "!" in front marks it important. The answer is a short sentence, so Siri
// can say what happened. The key comes from Einstellungen → Konto.

declare(strict_types=1);

require __DIR__ . '/lib/bullet.php';

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function answer(int $status, string $text): void
{
    http_response_code($status);
    echo $text;
    exit;
}

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        answer(405, 'Der Briefkasten nimmt nur Aufgaben an, die mit POST geschickt werden.');
    }
    $raw = file_get_contents('php://input', false, null, 0, 20001);
    if ($raw === false || strlen($raw) > 20000) {
        answer(413, 'Das ist zu lang für Bullet.');
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        $data = $_POST;
    }
    $uid = inboxOwner(trim((string) ($data['schluessel'] ?? '')));
    if ($uid === null) {
        answer(403, 'Der Schlüssel passt nicht. Den richtigen findest du in Bullet unter Einstellungen, Konto.');
    }
    $tasks = inboxTasks((string) ($data['text'] ?? ''), nowMs());
    if (!$tasks) {
        answer(400, 'Da kam kein Text an.');
    }
    addRecords($uid, $tasks);
    answer(200, count($tasks) === 1
        ? 'Steht in Bullet: ' . $tasks[0]['text']
        : count($tasks) . ' Aufgaben stehen jetzt in Bullet.');
} catch (Throwable $e) {
    error_log('Bullet letterbox: ' . $e->getMessage());
    answer(500, 'Bullet ist gerade nicht erreichbar. Bitte später noch einmal.');
}
