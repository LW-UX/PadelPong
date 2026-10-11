# Projektgedächtnis

Vor Änderungen an Spielregeln, Modi, Audio, Bestenliste oder Online-Verhalten ist `docs/project-decisions/pong.md` zu lesen.

Wenn eine dauerhafte Produkt-, Daten- oder Prozessentscheidung geändert wird, muss diese Datei im selben Arbeitsschritt aktualisiert werden. Veränderliche Bestände und konkrete Bestenlisteneinträge gehören nicht in die Dokumentation.

## Zusammenarbeit mit dem Nutzer

Der Nutzer arbeitet ausschließlich über Codex und verwendet kein Terminal. Notwendige und autorisierte Prüfungen führt Codex selbst aus. GitHub-Pushes führt der Nutzer selbst durch.

## Tests

Tests werden ergänzt, wenn sie fachliche Logik, behobene Fehler mit Wiederholungsrisiko oder sicherheits- und datenrelevantes Verhalten dauerhaft schützen. Vor einer Übergabe sind mindestens die bestehenden passenden Tests auszuführen.

## Supabase

Für Zugriffe auf die projektbezogene Supabase-Datenbank ist ausschließlich `tools/supabase-mcp.mjs` beziehungsweise `tools/run-supabase-mcp.sh` zu verwenden. Datenbank-Schreibaktionen sind dem Nutzer vor der Ausführung zur Freigabe vorzulegen. Bei einer Verbindungsstörung wird nicht auf einen Browser- oder Einmal-OAuth-Ablauf ausgewichen.
