# PadelPong

Diese Datei ist die kanonische Quelle für das saisonunabhängige Spiel PadelPong, seine Modi, Regeln, Audio- und Bestenlistenlogik.

## Produkt und Darstellung

- PadelPong ist ein öffentliches, saisonunabhängiges Retro-Minispiel unter `https://lw-ux.github.io/PadelPong/`.
- PadelPong besitzt keine Navigation oder Laufzeitabhängigkeit zur Liga. Die Liga öffnet das Spiel ausschließlich über einen externen Link in einem neuen Tab.
- Der Pixel-Look gilt dem Spielfeld; Typografie, dunkle Flächen, Akzente und Bedienelemente werden im PadelPong-Repository eigenständig gepflegt.
- Das Spielfeld zeigt eine 2D-Draufsicht mit berechneter Ballhöhe, Bodenschatten, nächstem Aufprall und Warnung vor ungültigem direktem Begrenzungskontakt.
- Ein Team besteht aus zwei fest gekoppelten Balken ohne aktiven Spielerwechsel. Tastatur sowie direktes Ziehen mit Maus oder Finger werden unterstützt.
- Auf Touch-Geräten verhindert die Spieloberfläche unbeabsichtigte Textauswahl und native Ziehgesten; echte Texteingaben bleiben normal bedienbar.

## Bewegung, Schläge und Regeln

- Die bisherige Mechanik heißt in der Auswahl „Standard“. Die lokale Variante mit vorgemerktem Lob und automatischem Smash heißt „Lob/Smash“; „Experiment“ ist keine sichtbare Variantenbezeichnung. Die letzte Auswahl wird nach Möglichkeit im Browser gespeichert, bleibt während einer Partie fest und wird bei einer Revanche übernommen.
- „Lob/Smash“ ist gegen den Computer und im 1v1-Laptop-Modus verfügbar. Seine lokale Simulation läuft mit 85 Prozent des Standardtempos; Ball, Teams, Computerreaktion und Punktübergänge werden gemeinsam verlangsamt, Countdown, Audio und Bildrate nicht. Die sichtbare Spielzeit folgt dabei weiterhin der Simulationszeit.
- In „Lob/Smash“ merkt die Shift-Taste den nächsten Lob vor; im Laptop-Duell gehören links Shift zum WASD-Team und rechts Shift zum Pfeiltasten-Team. Auf Touch-Geräten löst ein zusätzlicher Finger-Tipp die Vormerkung aus, ohne die Bewegung des ersten Fingers zu übernehmen. Ein weiterer Impuls hebt sie auf. Die sichtbare Vormerkung wird nach Schlag, Punktende, Pause, Fokusverlust, abgebrochener Touch-Eingabe oder Variantenwechsel gelöscht.
- Ein Lob erreicht als Ausgangsabstimmung 4,5 Court-Meter Scheitelhöhe und landet zwei Meter vor der gegnerischen Rückwand. Seitliche Richtung und bestehende Kontakt-, Netz-, Boden- und Wandregeln bleiben erhalten; Bewegungsdruck verändert seine Länge nicht.
- Ein fallender gegnerischer Lob wird vor dem ersten Bodenaufprall automatisch zum Smash, wenn das Team höchstens vier Meter vom Netz entfernt steht und die Ballhöhe zwischen 1,65 und 2,8 Court-Metern liegt. Der Smash benötigt weder Taste noch Vorwärtsdruck und zielt fünf Meter hinter das Netz. Eine eigene Lob-Vormerkung hat Vorrang und wartet auf die normale Schlaghöhe; Anspiele können keinen Smash auslösen.
- Bewegung besitzt begrenzte Beschleunigung, Geschwindigkeit, Bremsen und Richtungswechsel. Mensch und Computer unterliegen denselben räumlichen Grenzen.
- Schläge erfolgen automatisch in zulässiger Höhe. Trefferstelle, Courtposition und tatsächliche Bewegungsrichtung bestimmen Richtung, Flugkurve und Tempo; Eingabesprünge erzeugen keine zusätzliche Kraft.
- Der erste Bodenaufprall muss im gegnerischen Feld erfolgen. Danach sind Glas- und Zaunabpraller erlaubt; der zweite Bodenaufprall beendet den Punkt.
- Eigene Glasberührung vor dem ersten Aufprall ist erlaubt, eigener Zaun und gegnerische Begrenzung davor sind Fehler. Glas und Zaun dämpfen nur den senkrechten Geschwindigkeitsanteil unterschiedlich stark.
- Netzkontakt beendet den Punkt. Ein direkter Netzschlag verliert den Punkt; springt der Ball nach gültigem gegnerischem Bodenaufprall ohne weiteren Schlag ins Netz zurück, gewinnt das zuletzt schlagende Team.
- Pro Team ist nur ein Schlag bis zur gegnerischen Berührung zulässig. Eine anhaltende Überlappung desselben Kontakts zählt nicht doppelt.
- Ein vereinfachtes automatisches diagonales Anspiel ersetzt den echten Aufschlag. Es gibt keine Court-Ausflüge und keine zusätzliche Anti-Netzstehen-Regel. „Standard“ besitzt keinen gesonderten Lob oder Smash.
- Gespielt wird bis sieben ohne Abstand. Countdown, Pause, Fokusverlust, Neustart und Revanche halten in allen Modi dieselben Grundregeln ein.

## Computer und Schwierigkeit

- Der Computer verwendet dieselben Bewegungsgrenzen, besitzt aber begrenzte Reaktion und Vorhersage.
- „Leicht“ ist die Voreinstellung und reagiert langsamer, bewegt sich langsamer und macht unter Druck natürliche kontaktabhängige Fehler. „Schwer“ bleibt schneller und präziser.
- Die Schwierigkeit bleibt während einer Partie fest, wird für Revanchen übernommen und nach Möglichkeit im Browser gespeichert.
- Weitere interne CPU-Profile dürfen für spätere Modi erhalten bleiben, ohne automatisch öffentlich auswählbar zu werden.
- In „Lob/Smash“ entscheidet die CPU einmal pro ankommendem menschlichem Schlag über einen Lob, sofern der Mensch höchstens drei Meter vom Netz entfernt steht: 35 Prozent auf „Leicht“, 60 Prozent auf „Schwer“. Anspiele sind ausgeschlossen; bis zum Kontakt wird nicht neu gewürfelt.

## Audio und Bedienung

- Musik und Effekte besitzen getrennte gespeicherte Schalter. Musik läuft nur während aktivem Spiel; Menüs, Pause, Countdown und Ergebnisansicht bleiben musikfrei.
- Audio wird über einen langlebigen Mixer vorgeladen und mit der ersten Nutzerinteraktion aktiviert. Mobile und Desktop-Wiedergabe dürfen getrennt abgestimmt sein, ohne die Kanäle voneinander abhängig zu machen.
- Kontakt-, Punkt- und Partieende-Ereignisse verwenden semantisch passende Sounds. Ein punktentscheidender Kontakt erzeugt keinen doppelten Aufprall- und Punktsound.
- Mobil bündelt ein Menü Pause, Neustart, Bestenliste, Audio, Bildrate und Anleitung. Das Öffnen pausiert; Fortsetzen erfolgt ausdrücklich.

## Computer-Bestenliste

- Nur freiwillig eingetragene Siege gegen den Computer werden in Supabase gespeichert. Online- und Laptop-Duelle sowie Niederlagen erscheinen nicht.
- Siege in „Lob/Smash“ öffnen keine Gewinnerfassung und werden nicht gespeichert; die bestehende Bestenliste bleibt ausschließlich „Standard“ vorbehalten.
- Schwierigkeit und Regelversion werden beim Partiestart festgelegt und unveränderlich mit dem Sieg gespeichert. Änderungen an Physik oder Schwierigkeit können getrennte Listen erzeugen; frühere Regelversionen bleiben archiviert.
- Rangfolge: besseres Ergebnis vor schlechterem, danach kürzere Spielzeit. Exakt gleiche Leistungen teilen einen Rang; der längste Ballwechsel ist reine Zusatzinformation.
- Je Schwierigkeit und Regelversion werden die besten zehn Einträge sowie gegebenenfalls der eigene zuletzt gespeicherte Sieg angezeigt.
- Namen sind frei gewählt, nicht identitätsgeprüft und werden im Browser sowie serverseitig gegen Format und Sperrliste geprüft. Gleiche Namen sind zulässig.
- Die Bestenliste ist eine Freizeitwertung ohne serverseitige Verifikation des Spielverlaufs. Derselbe Sieg darf höchstens einmal gespeichert werden.

## 1v1 Laptop

- Zwei Personen spielen an derselben Tastatur mit getrennten Tastengruppen. Maus- und Touch-Steuerung sind in diesem Modus ausgeschaltet.
- Der Modus benötigt weder Raumcode, Anmeldung noch Netzwerk. Auf Touch-Geräten bleibt er sichtbar, aber deaktiviert.
- Pause, Fokusverlust, Revanche und Rückkehr zur Modusauswahl gelten gemeinsam für beide Personen.

## 1v1 Online

- Online verwendet ausschließlich „Standard“. Bei ausgewähltem „Lob/Smash“ ist der Online-Einstieg mit entsprechendem Hinweis deaktiviert; Protokoll und Datenbank werden für diese Variante nicht erweitert.
- Zwei Personen spielen auf eigenen Geräten ohne Anmeldung über einen kurzlebigen Raumcode. Ein Raum besitzt genau zwei Plätze und keine öffentliche Raumliste.
- Beide sehen das eigene Team unten. Der Host berechnet verbindlich Physik, Treffer, Zeit und Punkte; der Gast überträgt Eingaben und gleicht seine Darstellung ab.
- Der Modus ist eine Freizeitpartie ohne verifizierte Identität, serverseitigen Manipulationsschutz, persistente Ergebnisse oder Einfluss auf die Computer-Bestenliste.
- Raum- und Spielzustände werden vorübergehend über Supabase Realtime ausgetauscht. Verlassen, Neuladen oder ausbleibende Gegenstelle beendet nach einer begrenzten Wiederverbindungsphase den Raum; eine Host-Übernahme gibt es nicht.
- Beide Personen müssen für Start, Fortsetzen und Revanche bereit sein. Pause, mobiles Menü und Fokusverlust halten die gemeinsame Partie an.
