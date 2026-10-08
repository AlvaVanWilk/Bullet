# Bullet

Bullet Journal als Web-App fürs iPad (vor allem quer). Optik und Gefühl von echtem
Papier, „nur magisch“: handgeschriebene Druckschrift, Fineliner-Boxen, Textmarker,
dicke Durchstreichungen, kurze Animationen, die den Arbeitsfluss nie bremsen.

Bedienung und Einrichtung: `README.md`.

## Feste Regeln (von der Nutzerin so gewünscht)

- Masterliste ist unstrukturiert, ohne Kästchen. Farbe der Kategorie als Schriftfarbe
  oder als Textmarker (Einstellung). Rotes, handgeschriebenes „!“ vor wichtigen Aufgaben.
- Ein kleiner schwarzer Punkt vor einer Aufgabe der Masterliste heißt: Sie steht heute
  offen im Tag. Der Punkt verschwindet, wenn der Tag vorbei ist und sie nicht erledigt wurde.
- Ziehen schreibt immer nur hinüber. Das Original bleibt, auch im alten Tag.
- Unter heute liegt eine gestrichelte Linie: Dort Geschriebenes wird eine neue Aufgabe
  der Masterliste und steht im Tag. Beim Tippen werden Aufgaben aus der Liste
  vorgeschlagen, die heute noch nicht offen stehen (antippen = hineinschreiben).
- Im Tag: Kästchen vor der Aufgabe. Wichtig → Kästchen rot getönt, kein „!“. Kein
  Textmarker, die Kategoriefarbe nur als Klecks hinter der Aufgabe.
- Unerledigte Aufgaben vergangener Tage: verblasst, waagerechter Strich durchs
  Kästchen. In einen späteren Tag gezogen → „>“ im Kästchen.
- Deadlines erscheinen von selbst (rot) am Tag und wandern jeden Tag weiter, bis sie
  erledigt sind. Das Datum der Deadline wird nirgends angezeigt. Nachträgliches
  Abhaken in früheren Tagen und Wochen geht immer. Offene Deadlines lassen sich aus der
  Wochenübersicht in den heutigen Tag ziehen (früher erledigen; die Deadline bleibt);
  in anderen Wochen nimmt der Knopf „heute“ sie an. Eine Deadline von heute lässt sich
  im Post-it „auf morgen schieben“ (`task.deferredOn`): heute „>“ im Kästchen, blass,
  kein Punkt; die Deadline ändert sich nicht, morgen steht sie wieder offen da.
- Erledigt → Seitenleiste leuchtet auf. Beim Öffnen der Masterliste werden die seither
  erledigten Aufgaben nacheinander (in Erledigungsreihenfolge) dick durchgestrichen.
  Die Reihenfolge der Liste ändert sich nie. Nach 7 Tagen (einstellbar) verschwinden sie;
  alle bleiben im Archiv: eine Liste wie die Masterliste (nicht durchgestrichen, nicht nach
  Tagen geteilt, Erledigt-Datum klein am Ende), ein kleines Suchfeld mit Lupe für alles,
  sortieren (neueste/älteste zuerst, A–Z) und filtern (Kategorie, Deadline, wichtig, Foto
  oder Überweisung); Eintrag antippen → Post-it. Der
  Besen neben „Masterliste“ räumt Durchgestrichenes sofort weg (`settings.listClearedAt`).
- Rechts an der Hauptseite stecken Laschen wie Klebe-Fähnchen, mit gezeichneten Symbolen
  statt Schrift: Kästchen = Planer (Woche; schon offen → aktuelle Woche), Kiste = Archiv
  (eine eigene Seite). Die aktive liegt vorn auf dem Papier. Darunter ist Platz für mehr.
- Folgeaufgaben (`task.after`): Eine Aufgabe, die noch auf offene „Mütter“ wartet, steht
  nicht in der Masterliste. Ein kleines, mit Fineliner gezeichnetes Dreieck neben der
  Mutter (zu: nach rechts, offen: nach unten) klappt nur die nächste Ebene eingerückt
  aus; jede Folgeaufgabe mit eigenen Folgeaufgaben hat ihr eigenes. Noch ein Tipp
  klappt ein (alles darunter mit). Nie gespeichert, anfangs immer zu. Ist die Mutter durchgestrichen, erscheint die
  Folgeaufgabe vollständig darunter (nach dem Durchstreichen, mit Schreib-Animation).
  Mehrere Mütter: wartet auf alle, hängt unter jeder offenen („auch nach: …“), erscheint
  unter der zuletzt erledigten. Schleifen werden verhindert.
- Hauptseite: Kopf (Kalenderwoche, Boxen Termine/Deadlines/Besonderes) scrollt nicht.
  Tage von Montag bis heute; heute nie unterhalb der Fenstermitte. Vergangene Termine
  blass. Deadlines im Kopf in normaler Schrift; nur überfällige rot und leuchtend,
  erledigte dünn durchgestrichen (nicht mit dem dicken Marker).
- Tage als „6 DIENSTAG“ (oder „DIENSTAG 6“) in Kapitälchen; Hervorhebung wählbar
  (grauer Marker, Marker in Wochenfarbe, gerader Strich, Striche links/rechts, Rahmen).
- Besonderes in Grau, ohne Sternchen.
- Die Schrift sitzt auf den Punktreihen bzw. Linien: Zeilen sind Vielfache von 28 px,
  die Grundlinie der gewählten Schrift wird gemessen (`src/ui/baseline.ts`).
- Farben gedeckt und „erwachsen“, nicht knallig.
- Einband: Die Fläche unter den Seiten ist ein Buchleinen in wählbarer Farbe (Einstellungen
  → Aussehen; zehn gedeckte Farben oder eine eigene, Standard Nachtblau, `settings.cover`).
- Handy (`src/styles/screens.css`): dieselbe Ansicht, nur kleiner. Liste schmaler und
  anfangs eingeklappt; liegt sie offen über der Seite, klappt ein Tipp auf die Seite sie
  ein (der Tipp löst sonst nichts aus, Ziehen in den Tag geht weiter). Wochenübersicht
  als schmaler Streifen mit kleiner Schrift, Pfeile und Zahnrad in der Zeile der
  Kalenderwoche. Das iPad bleibt, wie es ist.
- Einstellungen: ein Blatt neben der Seite, nicht davor (kein Abdunkeln), am Kopf
  verschiebbar, Reiter Aussehen / Tage und Liste / Kalender / Konto. Jede Änderung
  ist sofort auf der Seite zu sehen.
- Leise Geräusche: Papier über Papier beim Laschenwechsel, Stift beim Durchstreichen
  (abschaltbar). Post-it: „speichern“, Notizfeld; kein „erledigt“ dort.
- Termine aus Google lassen sich in Bullet ausblenden, ohne sie in Google zu ändern.
- Termin oder Besonderes antippen → „Vorbereiten“: Die Aufgaben dort sind normale
  Aufgaben der Masterliste mit dem Tag des Termins als Deadline (änderbar) und merken
  sich den Termin (`task.link`). Neben dem Termin steht die Zahl der offenen. Für
  vergangene Termine gibt es keine neuen. Beim Tippen werden vorhandene offene Aufgaben
  vorgeschlagen; dazugenommen bekommt eine Aufgabe den Tag des Termins als Deadline,
  außer ihre Deadline ist früher. Folgeaufgaben gehören zum Termin ihrer Mutter (nur
  bei kommenden Terminen): im Termin-Post-it eingerückt darunter, blass solange sie
  warten, zählen mit. Eine wartende Aufgabe zeigt ihre Deadline nirgends (Tag, Kopf,
  Google), erst wenn sie dran ist. × an „für: …“ löst eine Aufgabe vom Termin.
- Fotos zu Aufgaben (Post-it „+ Foto“): verkleinert (JPEG, 2000 px), auf dem Gerät
  (IndexedDB) und in `bullet-daten/users/<uid>.photos/`, nur für angemeldete Geräte der
  Person. Aufgaben mit Foto oder Überweisung tragen eine Büroklammer.
- Überweisung an einer Aufgabe (`task.pay`): Empfänger, IBAN (Prüfziffer), Betrag, Zweck
  → GiroCode (EPC-QR) zum Scannen mit der Banking-App. „aus dem Foto lesen“ füllt leere
  Felder per Texterkennung im Gerät (tesseract.js, Dateien in `ocr/` auf dem eigenen
  Webspace, nie von fremden Servern). Bullet überweist nie selbst.
- Esc verlässt jede Schreibzeile (der angefangene Text verfällt).
- Siri: „Hey Siri, Bullet“ ist ein Kurzbefehl auf dem iPhone, der den diktierten Text an
  `briefkasten.php` schickt (POST, `schluessel` + `text`); jede Zeile wird eine Aufgabe
  am Ende der Masterliste, „wichtig“ vorne → „!“. Jede Person hat einen eigenen Schlüssel
  (Einstellungen → Konto), erneuerbar und abschaltbar; wer nicht mehr zur Familie gehört,
  kommt auch mit dem Schlüssel nicht mehr hinein. Erinnerungen von Apple liest eine
  Web-App nicht.
- Vorplanen künftiger Tage ist (vorerst) nicht vorgesehen. Vorausblättern in kommende
  Wochen geht, aber dort steht nur der Kopf (Wochenübersicht mit Terminen, Deadlines,
  Besonderem), keine Tage – Tage gibt es immer nur bis heute.
- Familie: Wer Bullet verwaltet (Adressen im Secret BULLET_EMAILS, sonst das erste Konto),
  gibt weitere Google-Adressen in den Einstellungen frei („Familie“, liegt in
  bullet-daten/familie.json). Jede Person hat eigene, getrennte Daten; wer entfernt wird,
  ist auf allen Geräten abgemeldet.

## Technik

- Preact + TypeScript + Vite. `src/lib` enthält die Regeln ohne Oberfläche und ist
  getestet (`npm test`). Der PHP-Server in `public/` ist es auch (`npm run test:php`).
- Läuft auf dem IONOS-Webspace der Nutzerin unter `alva-van-wilk.de/bullet`.
  Anmeldung mit Google (der Server hält das Refresh-Token), Abgleich per `api.php`.
  Zusammenführen: pro Datensatz gewinnt der neuere.
- Veröffentlichung wie bei Envoy: Arbeitszweig → Testordner `bullet-test` („Bullet
  Test“, oranges Icon, Schild „Test“, eigene Daten). `main` → echter Ordner. Auf
  `main` kommt nur, was die Nutzerin im Testordner angesehen und mit „freigeben“
  freigegeben hat.
- UI-Texte auf Deutsch, Bezeichner und Kommentare im Code auf Englisch.
- Vor dem Pushen: `npm test`, `npm run test:php`, `npm run build`, danach
  `node scripts/e2e.cjs` (zwei Geräte, Abgleich, Stile von Post-it und Einstellungen).
