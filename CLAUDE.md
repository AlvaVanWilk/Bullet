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
  (eine eigene Seite), Sanduhr = Wartet. Die aktive liegt vorn auf dem Papier.
- Folgeaufgaben (`task.after`): Eine Aufgabe, die noch auf offene „Mütter“ wartet, steht
  nicht in der Masterliste. Ein kleines, mit Fineliner gezeichnetes Dreieck neben der
  Mutter (zu: nach rechts, offen: nach unten) klappt nur die nächste Ebene eingerückt
  aus; jede Folgeaufgabe mit eigenen Folgeaufgaben hat ihr eigenes. Noch ein Tipp
  klappt ein (alles darunter mit). Nie gespeichert, anfangs immer zu. Ist die Mutter durchgestrichen, erscheint die
  Folgeaufgabe vollständig darunter (nach dem Durchstreichen, mit Schreib-Animation).
  Mehrere Mütter: wartet auf alle, hängt unter jeder offenen („auch nach: …“), erscheint
  unter der zuletzt erledigten. Schleifen werden verhindert.
- Projekte (`project`, `task.projectId`): dritte Lasche „Projekte“ in der Seitenleiste.
  In der Masterliste steht nur eine Zeile pro Projekt (an seinem Platz nach Anlegezeit)
  mit seinem Bild davor; „!“ und „•“ liegen darüber. Antippen → ein Zettel, ganz
  leicht in der Projektfarbe getönt, mit einer Falz längs und quer (Kreuz in der
  Mitte, kein Knittern), klappt sich lang und schmal über der Seitenleiste direkt
  unter der Projektzeile auf (offene Aufgaben, daraus in heute ziehen; daneben tippen
  schließt ihn). Im Tag steht das Bild vor dem Kästchen im Rand.
  Bilder: eine Farbe, höchstens ein Punktekästchen groß, wie dünner Marker; selbst
  gezeichnet (Pencil/Finger, `project.drawing`), abstrakte Kritzeleien
  (`scripts/doodles.mjs`) oder Dinge (Lucide), erzeugt mit `scripts/project-icons.mjs`.
  Farbe frei aus dem Farbkreis (Ton, Grauanteil) mit Helligkeitsregler (`#rrggbb`).
  Projektseite: Titel in Kapitälchen; Bild groß und schräg auf einem Klecks (Klecksform
  mit Spritzern, ohne Umrandung) in seiner Farbe, Fortschritt,
  Notizen, Aufgaben, „Projekt abschließen“. Gelöscht → Aufgaben zurück in die
  Masterliste. Kategorien, Vorschläge und Archiv zeigen Projektaufgaben einzeln.
- Bereiche (`area`, `task.areaId`): Ein Projekt lässt sich in Bereiche teilen. Auf der
  Projektseite ist jeder Bereich eine Box, mit Marker in der Projektfarbe gezeichnet,
  Name in Kapitälchen oben im Rahmen (daneben klein die Zahl der offenen). Die Boxen
  füllen die Seite zeilenweise (iPad zwei bis drei Spalten, Handy eine). Aufgaben ohne
  Bereich stehen als Liste über den Boxen (ohne Bereiche sieht die Seite aus wie vorher).
  Reihenfolge wählbar (`area.order`): Namen gedrückt halten und die Box an einen
  anderen Platz ziehen (rastet ein), oder Namen antippen → Zettel mit „ganz nach vorn“,
  ‹ ›, umbenennen, löschen (Aufgaben bleiben, dann über den Boxen). Aufgaben zwischen
  Boxen ziehen oder im Post-it „Bereich“ wählen; Folgeaufgaben bleiben im Bereich der
  Mutter. Auf dem Projekt-Zettel: Bereiche als kleine Zwischenüberschriften.
- Unteraufgaben (`task.parentId`, eine Ebene, nur innerhalb eines Projekts): auf der
  Projektseite eine Aufgabe auf eine andere ziehen (nur dort, damit sich das Ziehen sonst
  nicht verheddert); eingerückt darunter, auch auf dem Projekt-Zettel. In eine Box oder
  über die Boxen gezogen bzw. „Teil von: … ×“ im Post-it → wieder eigenständig. Sie
  gehören zum Bereich ihrer Aufgabe und wandern mit. Wird eine Aufgabe erledigt, unter
  der noch etwas offen ist, fragt ein Zettel für jede einzeln (und „alle“): ✓ erledigt
  (ohne sie in den Tag zu schreiben), ⧗ wartet auf … (Name aus dem Text vorgeschlagen,
  z. B. „an Claude“) oder offen. Wird die Aufgabe wieder geöffnet („wieder offen“ im
  Post-it), nimmt sie das zurück (`task.byParent`), außer es wurde inzwischen von Hand
  geändert. Wie das im Alltag passt, probiert die Nutzerin noch aus.
- „Wartet auf …“ (`task.pending`: wer, seit wann): Eine Aufgabe liegt bei jemand anderem
  (abgegeben, Antwort steht aus). Im Post-it setzen (Namen von früher als Chips) und mit
  „×“ zurücknehmen. Sanduhr im Kästchen (auch an vergangenen Tagen statt des Strichs), in
  den Listen blass mit Sanduhr statt Punkt und „· wer“ dahinter; Deadlines wandern weiter.
  Seite „Wartet“ (Lasche mit Sanduhr): eine Fineliner-Box pro Person, „seit …“. Erledigt
  → wartet nicht mehr.
- Teilen (im Post-it das Teilen-Zeichen rechts neben „löschen“, ohne Text): Fensterchen
  mit Auswahl (mit Unteraufgaben, erledigte auch, mit Notizen, mit Bildern klein/groß),
  Vorschau wie es aussieht, unten „als Bild“ (PNG, sehr lang → mehrere) oder „als PDF“
  (A4-Seiten als Bilder, `src/lib/pdf.ts`), dann das Teilen-Menü des Geräts (Claude, Mail,
  Dateien, Drucken; ohne Menü: Download).
- Post-it einer Aufgabe: Kategorie, Projekt und Bereich je als Auswahlmenü (mit „ohne“).
  In der Notiz beendet Enter die Eingabe, Shift+Enter macht eine neue Zeile. Erledigte
  Aufgaben haben „wieder offen“ (außer im Tag, dort ist das Kästchen).
- Nächster Schritt (`task.next`): höchstens einer offen pro Projekt (sonst plant man,
  statt zu handeln), gesetzt mit dem kleinen Pfeil vor einer Aufgabe auf Zettel oder
  Projektseite. Dann steht in der Masterliste statt der Projektzeile dieser Schritt mit
  dem Projektbild davor, als normale Zeile (eigenes „!“/„•“, ziehen, Post-it); das Bild
  öffnet den Zettel. Kein Projektname dabei. Auf dem Zettel steht er oben, darunter
  abgesetzt die übrigen (scrollbar). Erledigt → durchgestrichen; seine nächste
  Folgeaufgabe im Projekt wird von selbst der nächste Schritt und schreibt sich darunter.
  Ohne nächsten Schritt: die Projektzeile mit blassem „→ ?“.
- Hauptseite: Kopf (Kalenderwoche, Boxen Termine/Deadlines/Besonderes) scrollt nicht.
  Tage von Montag bis heute; heute nie unterhalb der Fenstermitte. Vergangene Termine
  blass. Deadlines im Kopf in normaler Schrift; nur überfällige rot und leuchtend.
  Erledigte verschwinden aus dem Kopf (beim Abhaken kurz dünn durchgestrichen, dann
  ausgeblendet; auch in früheren Wochen), Folgeaufgaben rücken nach.
- Tage als „6 DIENSTAG“ (oder „DIENSTAG 6“) in Kapitälchen; Hervorhebung wählbar
  (grauer Marker, Marker in Wochenfarbe, gerader Strich, Striche links/rechts, Rahmen).
- Besonderes in Grau, ohne Sternchen.
- Die Schrift sitzt auf den Punktreihen bzw. Linien: Zeilen sind Vielfache von 28 px,
  die Grundlinie der gewählten Schrift wird gemessen (`src/ui/baseline.ts`). In den
  Listen stehen die Zeilen einer umgebrochenen Aufgabe enger; jede Aufgabe beginnt
  trotzdem auf einer Punktreihe, so ist zwischen Aufgaben mehr Abstand (`gridRows.ts`).
- Farben gedeckt und „erwachsen“, nicht knallig.
- Überschriften grundsätzlich in Kapitälchen (nicht in Großbuchstaben geschrieben).
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
  (abschaltbar). Post-it: „speichern“, Notizfeld.
- „erledigt“ im Post-it (nicht im Tag, dort ist das Kästchen): Steht die Aufgabe heute
  offen, ist sie heute erledigt. Sonst fragt es, an welchem Tag (heute, die sechs Tage
  davor, „früher“ mit Datum), und schreibt sie dort abgehakt hinein (`entry.retro`;
  dort wieder angetippt, verschwindet sie aus dem Tag). In Tage ziehen geht weiterhin
  nur nach heute.
- Deko (`deco`, `award`; Regeln in `src/lib/milestones.ts`, Motive in `src/ui/decoPieces.tsx`):
  Besondere Momente schenken je einmal einen Stempel, Sticker, eine Kritzelei oder
  Washi-Tape. Belohnung als kleines Extra, kein Fokus: keine Liste, kein Fortschritt,
  man weiß vorher nicht, wofür es was gibt (nichts zum Hinarbeiten oder Sammeln).
  Gleich angekündigt mit einem Zettel: Art als Überschrift, Bild, was passiert ist, ein
  passender Spruch; antippen legt ihn weg (auf allen Geräten). Kein Konfetti, kein „Du
  hast eine Belohnung erhalten!“. Aufkleben: freie Stelle der Woche gedrückt halten →
  Fächer mit den Arten → darauf gleiten → Motiv → loslassen (klebt am Druckpunkt);
  ohne Gleiten loslassen = antippen. Hängt an einem Tag oder am Kopf der Woche und
  scrollt mit, ohne Funktion, über der Schrift, ohne Tippen zu blockieren. Größe und
  Drehung frei (Griff oder zwei Finger), „×“ zieht ab. Abschaltbar (Aussehen → Deko).
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
