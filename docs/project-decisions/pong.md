# PadelPong

Diese Datei ist die kanonische Quelle für das saisonunabhängige Spiel PadelPong, seine Modi, Regeln, Audio- und Bestenlistenlogik.

## Produkt und Darstellung

- PadelPong ist ein öffentliches, saisonunabhängiges Retro-Minispiel unter `https://lw-ux.github.io/PadelPong/`.
- PadelPong besitzt keine Navigation oder Laufzeitabhängigkeit zur Liga. Die Liga öffnet das Spiel ausschließlich über einen externen Link in einem neuen Tab.
- Der Pixel-Look gilt dem Spielfeld; Typografie, dunkle Flächen, Akzente und Bedienelemente werden im PadelPong-Repository eigenständig gepflegt.
- Das Spielfeld zeigt eine 2D-Draufsicht mit berechneter Ballhöhe, Bodenschatten, nächstem Aufprall und Warnung vor ungültigem direktem Begrenzungskontakt.
- Ein Team besteht aus zwei fest gekoppelten Balken ohne aktiven Spielerwechsel. Ausnahme ist „2v2 Online“: Dort steuert jede Person genau einen Balken ihres Teams. Tastatur sowie direktes Ziehen mit Maus oder Finger werden unterstützt.
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
- Auf dem Desktop zeigt die Fußleiste Pause, Neustart, ein Menü, Erklärung und Feedback. Das Menü bündelt Bestenliste, Musik, Effekte und Bildrate und pausiert beim Öffnen nicht.
- Mobil bündelt ein Menü Pause, Neustart, Bestenliste, Audio, Bildrate, Erklärung und Feedback. Das Öffnen pausiert; Fortsetzen erfolgt ausdrücklich.
- Steuerung („01 / Steuerung“) und Regeln („02 / So läuft’s“) stehen nicht neben dem Spielfeld, sondern gemeinsam im eigenen Menüpunkt „Erklärung“. Das Öffnen pausiert die Partie; Fortsetzen erfolgt ausdrücklich.

## Feedback

- Über „Feedback“ öffnet sich ein Freitextfeld; das Öffnen pausiert die Partie, Fortsetzen erfolgt ausdrücklich.
- Feedback ist anonym: gespeichert werden in Supabase nur der Text (3 bis 1000 Zeichen), Modus (2v2 Online zählt als „online“), Spielvariante, Schwierigkeit, Gerätetyp (Desktop oder Mobil) und der Zeitpunkt. Name, Kontaktdaten oder Browserkennung werden nicht erhoben.
- Der Browser schreibt ausschließlich über eine Datenbankfunktion; die Feedback-Tabelle ist öffentlich weder lesbar noch direkt beschreibbar. Wiederholtes Senden desselben Entwurfs speichert ihn höchstens einmal. Eine grobe globale Mengenbremse schützt vor automatisierter Flut.

## Computer-Bestenliste

- Nur freiwillig eingetragene Siege gegen den Computer werden in Supabase gespeichert. Online-Partien (1v1 und 2v2), Laptop-Duelle sowie Niederlagen erscheinen nicht.
- Siege in „Lob/Smash“ öffnen keine Gewinnerfassung und werden nicht gespeichert; die bestehende Bestenliste bleibt ausschließlich „Standard“ vorbehalten.
- Schwierigkeit und Regelversion werden beim Partiestart festgelegt und unveränderlich mit dem Sieg gespeichert. Änderungen an Physik oder Schwierigkeit können getrennte Listen erzeugen; frühere Regelversionen bleiben archiviert.
- Rangfolge: besseres Ergebnis vor schlechterem, danach kürzere Spielzeit. Exakt gleiche Leistungen teilen einen Rang; der längste Ballwechsel ist reine Zusatzinformation.
- Je Schwierigkeit und Regelversion werden die besten zehn Einträge sowie gegebenenfalls der eigene zuletzt gespeicherte Sieg angezeigt.
- Namen sind frei gewählt, nicht identitätsgeprüft und werden im Browser sowie serverseitig gegen Format und Sperrliste geprüft. Gleiche Namen sind zulässig.
- Die Bestenliste ist eine Freizeitwertung ohne serverseitige Verifikation des Spielverlaufs. Derselbe Sieg darf höchstens einmal gespeichert werden.

## 1v1 Laptop

- Zwei Personen spielen an derselben Tastatur mit getrennten Tastengruppen. Maus- und Touch-Steuerung sind in diesem Modus ausgeschaltet.
- Dasselbe Spielfeld wird zweimal nebeneinander gezeigt, damit keine Person oben spielen muss: links um 180 Grad gedreht für WASD (Korall), rechts normal für die Pfeiltasten (Gelb). Beide sehen das eigene Team unten; Teamfarben bleiben in beiden Ansichten gleich.
- Die WASD-Tasten gelten relativ zur gedrehten Ansicht: W läuft zum Netz, A und D bewegen auf dem eigenen Bildschirm nach links und rechts.
- Der Modus benötigt weder Raumcode, Anmeldung noch Netzwerk. Auf Touch-Geräten bleibt er sichtbar, aber deaktiviert.
- Pause, Fokusverlust, Revanche und Rückkehr zur Modusauswahl gelten gemeinsam für beide Personen.

## 1v1 Online

- Online verwendet ausschließlich „Standard“. Bei ausgewähltem „Lob/Smash“ ist der Online-Einstieg ohne zusätzlichen Hinweistext deaktiviert; Protokoll und Datenbank werden für diese Variante nicht erweitert.
- Zwei Personen spielen auf eigenen Geräten ohne Anmeldung über einen kurzlebigen Raumcode. Ein Raum besitzt genau zwei Plätze und keine öffentliche Raumliste.
- Beide sehen das eigene Team unten. Der Host berechnet verbindlich Physik, Treffer, Zeit und Punkte; der Gast überträgt Eingaben und gleicht seine Darstellung ab.
- Der Modus ist eine Freizeitpartie ohne verifizierte Identität, serverseitigen Manipulationsschutz, persistente Ergebnisse oder Einfluss auf die Computer-Bestenliste.
- Raum- und Spielzustände werden vorübergehend über Supabase Realtime ausgetauscht. Verlassen, Neuladen oder ausbleibende Gegenstelle beendet nach einer begrenzten Wiederverbindungsphase den Raum; eine Host-Übernahme gibt es nicht.
- Beide Personen müssen für Start, Fortsetzen und Revanche bereit sein. Pause, mobiles Menü und Fokusverlust halten die gemeinsame Partie an.

## 2v2 Online

- Vier Personen spielen auf eigenen Geräten ohne Anmeldung über einen kurzlebigen Raumcode. Der Modus ist ein eigener Menüeintrag; 1v1- und 2v2-Räume sind getrennt, ein Code gilt nur für seinen Modus. Wie 1v1 Online gibt es ausschließlich „Standard“.
- Jede Person steuert genau einen Balken. Die Balken eines Teams bewegen sich unabhängig voneinander, bleiben aber jeweils in ihrer Spielfeldhälfte (links/rechts) mit denselben Bewegungsgrenzen wie im übrigen Spiel. Alle Spielregeln gelten pro Team; ein Schlag des Partners zählt als zweiter Teamkontakt.
- Die Teams heißen „Gelb“ und „Korall“ und behalten ihre Farbe auf allen Geräten. Jede Person sieht das eigene Team unten; der eigene Balken ist mit einem kleinen weißen Pfeil markiert. „Links/Rechts“ eines Platzes ist aus Sicht des jeweiligen Teams benannt.
- Lobby: Ein Raum hat vier Plätze. Beitretende erhalten automatisch einen Platz, abwechselnd nach Teams. Im Warteraum und nach Partieende kann jede Person auf einen freien Platz wechseln oder mit einem besetzten Platz tauschen; der Host kann die Teams mischen, wobei sich die Paarung dabei immer ändert. Jede Platzänderung hebt die Bereitschaft aller auf. Während einer Partie sind die Plätze fest.
- Start, Fortsetzen und Revanche erfolgen erst, wenn alle vier Plätze besetzt und alle Personen bereit und anwesend sind. Pause, Fokusverlust oder eine unterbrochene Verbindung einer Person halten die Partie für alle an.
- Verlässt eine Person den Raum oder kehrt sie innerhalb der Wiederverbindungsphase nicht zurück, wird eine laufende Partie abgebrochen und der Raum kehrt mit freiem Platz in den Warteraum zurück; der Spielstand verfällt. Verlässt der Host den Raum, endet er für alle. Eine Host-Übernahme gibt es nicht. Teilnehmende sind nur als „Spieler 1–4“ ohne Namen sichtbar.
- Der Host berechnet verbindlich Physik, Treffer, Zeit und Punkte. Gäste senden ihre Eingaben über einen eigenen Kanal, den nur der Host empfängt; Eingaben werden nur bei Änderung (höchstens 12,5-mal pro Sekunde) und sonst alle 250 ms als Lebenszeichen gesendet. Der Host verteilt 12,5 Spielstände pro Sekunde an alle.
- Flüssige Darstellung bei Gästen: Der eigene Balken reagiert sofort und wird anhand der vom Host bestätigten Eingaben mit der gemessenen Rundlaufzeit nachkorrigiert. Ball und übrige Balken werden zwischen Spielständen lokal weitergerechnet und Abweichungen weich ausgeglichen; Punkte, Töne und Spielstand stammen ausschließlich vom Host.
- Nachrichtenbudget: Supabase zählt eine Broadcast-Nachricht als eine gesendete plus eine je Empfänger. Ein laufender 2v2-Raum verursacht so etwa 70 bis 120 Realtime-Nachrichten pro Sekunde; das Kontingent teilt sich das Projekt mit allen anderen Räumen und Anwendungen derselben Supabase-Instanz.
- Wie 1v1 Online ist der Modus eine Freizeitpartie ohne verifizierte Identität, serverseitigen Manipulationsschutz, persistente Ergebnisse oder Einfluss auf die Computer-Bestenliste.
