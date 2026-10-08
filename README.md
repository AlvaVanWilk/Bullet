# Bullet

Ein Bullet Journal als App fürs iPad (quer), das wie echtes Papier aussieht und
sich auch so anfühlt, nur ein bisschen magisch.

- **Masterliste** in der Seitenleiste: Mit Enter kommt eine Aufgabe dazu. Daneben
  liegen die **Kategorien** mit eigenen Textmarker-Farben. Zwischen beiden wechselst
  du über die zwei Post-it-Laschen unten. Dabei tauschen die beiden Blätter ihren
  Platz, und die Leiste lässt sich ein- und ausfahren.
- **Hauptseite** mit der Woche: Kalenderwoche, darunter die Boxen **Termine**
  (aus Google), **Deadlines** und **Besonderes**. Darunter steht jeder Tag von
  Montag bis heute.
- **Aufgaben in den Tag ziehen:** kurz gedrückt halten, dann ziehen. Die Aufgabe wird
  hineingeschrieben und bekommt ein Kästchen. Wird sie abgehakt, leuchtet die
  Seitenleiste auf, und beim nächsten Öffnen wird die Aufgabe dort dick
  durchgestrichen.
- **Deadlines** stehen als ganztägiger Termin im Google-Kalender „Bullet“ und
  erscheinen am Tag selbst von allein in Rot. Bis sie erledigt sind, wandern sie
  jeden Tag weiter.
- **Abgleich zwischen Geräten** über den eigenen Webspace. Die Anmeldung läuft über
  Google.

## Bedienung in Kürze

| Was | Wie |
| --- | --- |
| Aufgabe anlegen | unten in der Masterliste schreiben, Enter |
| Aufgabe bearbeiten (Text, Notiz, „!“, Deadline, Kategorie, löschen) | Aufgabe antippen, dann klebt ein Post-it daneben; „speichern“ oder daneben tippen |
| in den heutigen Tag schreiben | auf der gestrichelten Linie unter heute schreiben, Enter: Die Aufgabe steht dann im Tag und in der Masterliste. Beim Tippen erscheinen passende Aufgaben aus der Liste, antippen schreibt sie hinein. Oder: Aufgabe kurz gedrückt halten und in den heutigen Tag ziehen; das geht auch mit Deadlines aus der Wochenübersicht (früher erledigen, die Deadline bleibt). In anderen Wochen auf den Knopf „heute“ ziehen. |
| in eine Kategorie legen | Kategorie öffnen (Seite rechts), Aufgabe aus der Masterliste hineinziehen, oder oben in der Kategorie tippen und eine vorgeschlagene Aufgabe wählen |
| Farbe einer Kategorie | auf den Farbklecks vor ihrem Namen tippen |
| abhaken | Kästchen im Tag antippen (geht auch nachträglich in früheren Tagen und Wochen) |
| unerledigte Aufgabe von gestern weitertragen | aus dem alten Tag in heute ziehen; im alten Tag steht dann „>“ |
| frühere und kommende Wochen ansehen | Pfeile neben der Kalenderwoche, „heute“ führt zurück; in kommenden Wochen steht nur die Wochenübersicht |
| Familie dazuholen | Einstellungen → Familie → Google-Adresse eintragen → „freigeben“. Jede Person hat ihre eigene Liste und ihren eigenen Kalender. |
| Besonderes eintragen (z. B. Geburtstag, jährlich) | „+“ an der Box „Besonderes“ |
| für einen Termin etwas vorbereiten | Termin (oder Besonderes) in der Wochenübersicht antippen, unter „Vorbereiten“ schreiben, Enter. Beim Tippen erscheinen passende Aufgaben, die es schon gibt; antippen nimmt sie dazu (die Deadline rückt auf den Tag des Termins, eine frühere bleibt). Die Aufgabe steht ganz normal in der Masterliste und hat den Tag des Termins als Deadline; im Post-it der Aufgabe lässt sie sich ändern. Die kleine Zahl neben dem Termin zeigt, wie viel noch offen ist. Wird der Termin in Google verschoben, bleibt die Deadline, wie sie ist. |
| einen Termin aus Google nicht mehr sehen | Termin antippen → „ausblenden“ (bei Serien auch „alle Wiederholungen“). In Google bleibt er unverändert; zurückholen unter Einstellungen → Ausgeblendete Termine |
| alle erledigten Aufgaben, mit Suche nach Wort und Datum | die Lasche „Master“ lange gedrückt halten, oder Einstellungen → ganz unten |
| Papier, Handschrift (12 zur Auswahl), Tage als „6 Dienstag“ oder „Dienstag 6“ und wie sie hervorgehoben werden, Textmarker statt Schriftfarbe, Geräusche, Kalender | Zahnrad oben rechts. Das Blatt hat vier Reiter (Aussehen, Tage und Liste, Kalender, Konto) und lässt sich an seinem Kopf beiseiteschieben. Die Seite dahinter zeigt jede Änderung sofort. |

## Testfassung und echte App

Wie bei Envoy gibt es zwei Fassungen auf dem Webspace:

- **Testfassung** im Ordner `bullet-test` (also `alva-van-wilk.de/bullet-test`).
  Jede neue Arbeit landet zuerst hier. Sie heißt „Bullet Test“, hat ein oranges Icon
  und unten rechts ein Schild „Test“. Ihre Daten sind von der echten App getrennt.
- **Echte App** im Ordner `bullet` (`alva-van-wilk.de/bullet`). Sie ändert sich nur,
  wenn eine geprüfte Fassung freigegeben wird. Freigeben heißt: Claude „freigeben“
  sagen. Dann kommt der geprüfte Stand auf den Zweig `main` und wird hochgeladen.

## Einrichten (einmal)

### 1. Google-Zugang anlegen (etwa 10 Minuten)

1. [console.cloud.google.com](https://console.cloud.google.com) öffnen, oben ein
   **neues Projekt** anlegen, zum Beispiel „Bullet“.
2. **APIs & Dienste → Bibliothek** → „Google Calendar API“ suchen → **Aktivieren**.
3. **APIs & Dienste → OAuth-Zustimmungsbildschirm** (oder „Google Auth Platform“):
   - Nutzertyp **Extern**, App-Name „Bullet“, deine E-Mail-Adresse als Kontakt.
   - Unter **Zielgruppe** die App **veröffentlichen** („In Produktion“). Das ist
     wichtig: Im Testmodus wirft Google die Kalenderverbindung nach 7 Tagen
     raus. Eine Überprüfung durch Google ist für den eigenen Gebrauch nicht nötig.
     Beim Anmelden zeigt Google dann einmal „Google hat diese App nicht
     überprüft“. Dort auf **Erweitert → Weiter zu Bullet** tippen.
4. **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID**:
   - Anwendungstyp **Webanwendung**, Name „Bullet“.
   - **Autorisierte Weiterleitungs-URIs**, beide eintragen:
     - `https://alva-van-wilk.de/bullet/oauth.php`
     - `https://alva-van-wilk.de/bullet-test/oauth.php`

     Wenn du die Seite manchmal mit `www.` öffnest, trag beide Adressen zusätzlich
     mit `www.` ein.
   - Speichern. Google zeigt dann **Client-ID** und **Clientschlüssel**. Beide gleich
     notieren.

### 2. Die Daten bei GitHub hinterlegen

Repository auf github.com → **Settings → Secrets and variables → Actions → New
repository secret**:

| Name | Wert |
| --- | --- |
| `IONOS_SFTP_HOST` | wie bei Envoy |
| `IONOS_SFTP_USER` | wie bei Envoy |
| `IONOS_SFTP_PASSWORD` | wie bei Envoy |
| `IONOS_SFTP_PATH` | der Ordner für Bullet im Ordner der Domain, also wie bei Envoy, nur mit `bullet` am Ende (z. B. `/wordpress/bullet`). Der Testordner heißt dann von selbst `…/bullet-test`. |
| `GOOGLE_CLIENT_ID` | die Client-ID aus Schritt 1 |
| `GOOGLE_CLIENT_SECRET` | der Clientschlüssel aus Schritt 1 |
| `BULLET_EMAILS` | deine Google-Adresse. Wer hier steht, verwaltet Bullet und kann in der App weitere Personen freigeben (Einstellungen → Familie). Ohne diesen Eintrag verwaltet das erste Konto, das sich anmeldet. |

GitHub zeigt die Werte danach nie wieder an, auch nicht in den Protokollen. Die
Google-Daten landen auf dem Webspace in `bullet-config.php`. Die Datei ist von außen
gesperrt und steht nicht im Repository.

### 3. Hochladen lassen

Unter **Actions** startet der Ablauf „Prüfen und hochladen“ bei jeder Änderung von
selbst. Nach dem Eintragen der Secrets dort den letzten Lauf mit **Re-run all jobs**
neu starten. Ein grüner Haken heißt: getestet, gebaut, hochgeladen.

### 4. Aufs iPad

1. `alva-van-wilk.de/bullet-test` in **Safari** öffnen.
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Die App vom Home-Bildschirm starten und **Mit Google anmelden**. Dabei den
   Kalenderzugriff erlauben (das Häkchen nicht entfernen).

Auf jedem weiteren Gerät genauso anmelden, dann gleichen sich die Daten ab. Ohne
Verbindung läuft die App weiter, und Änderungen werden nachgeholt.

### 5. Erinnerungen an Deadlines

Bullet legt im Google-Kalender einen eigenen Kalender **„Bullet“** an und trägt
jede Deadline dort als ganztägigen Termin ein. Für die zwei Erinnerungen in Google
Kalender (am Computer) Folgendes tun:
**Einstellungen → Bullet → Benachrichtigungen für ganztägige Termine** → „1 Tag
vorher um 18:00“ und „Am selben Tag um 08:00“ hinzufügen.
Eine Erinnerung am selben Tag erlaubt Google nur auf diesem Weg, nicht über die
Schnittstelle. Wer das nicht einrichten möchte, stellt in Bullet unter Einstellungen →
„Erinnerung an Deadlines“ auf „immer am Vortag um 18 Uhr“.

Ist eine Deadline erledigt, bleibt der Termin mit „✓“ stehen, aber ohne Erinnerung.

## Aufbau

| Ort | Inhalt |
| --- | --- |
| `src/lib/` | die Regeln ohne Oberfläche: Daten (`model.ts`), Tage und Wochen (`dates.ts`), was wo steht (`logic.ts`: Kästchen, Deadlines, Archiv, Vorschläge) |
| `src/store/` | Speicher auf dem Gerät (IndexedDB) und Zusammenführen beim Abgleich |
| `src/server.ts` | Anmeldung und Abgleich mit `api.php` |
| `src/google/` | Google-Kalender: Termine der Woche, Kalender „Bullet“, Deadlines |
| `src/ui/` | die Ansichten: `Sidebar.tsx` (Masterliste, Kategorien, Laschen, Tausch), `WeekView.tsx` (Kopf der Woche, Tage), `CategoryView.tsx`, `PostIt.tsx`, `Settings.tsx`, `Archive.tsx`, `drag.ts` (Ziehen mit dem Finger), `ink.tsx` (handgezeichnete Boxen, Kästchen, Durchstreichen) |
| `src/styles/` | Papier, Seitenleiste, Woche, Post-its |
| `public/api.php`, `public/oauth.php`, `public/lib/bullet.php` | der Server: Google-Anmeldung, Kalender-Schlüssel, Abgleich. Daten liegen in `bullet-daten/` auf dem Webspace, gesperrt per `.htaccess` |
| `tests/` | Regeln (`npm test`) und Server (`npm run test:php`) |

Entwickeln: `npm install`, dann `npm run dev`. Ohne Server läuft die App als Vorschau
mit Beispieldaten. `?heute=2026-10-08` in der Adresse tut so, als wäre ein anderer
Tag. Die Icons zeichnet `node scripts/icons.cjs`.
