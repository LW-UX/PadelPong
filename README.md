# PadelPong

PadelPong ist ein öffentliches Retro-Minispiel mit Einzelspieler-, Laptop- und Online-Modus. Die statische Website wird ohne Build-Schritt über GitHub Pages veröffentlicht.

## Lokal prüfen

Die Tests verwenden ausschließlich die in Node.js enthaltenen Werkzeuge:

```text
npm test
```

Für die manuelle Prüfung wird das Repository über einen lokalen Webserver geöffnet. Direktes Öffnen als `file://` ist wegen Browser-Sicherheitsregeln nicht geeignet.

## Struktur

- `index.html` ist der Einstiegspunkt der statischen Website.
- `src/` enthält die Spielmodule und die öffentliche Supabase-Konfiguration.
- `assets/` bündelt Styles, Audio, Spielfeldgrafik, Favicon und Fonts.
- `tests/` enthält die dauerhaften Spiel- und Schnittstellentests.
- `supabase/baseline/` rekonstruiert das Pong-Schema ausschließlich für isolierte Datenbanktests.
- Neue produktive Pong-Migrationen werden künftig unter `supabase/migrations/` angelegt.
- `docs/project-decisions/pong.md` enthält die dauerhaften Produktentscheidungen.

## Supabase

PadelPong nutzt vorerst dieselbe Supabase-Instanz wie die Padel-Liga. Der Browser verwendet nur die öffentliche Projektadresse und den öffentlichen Publishable Key aus `src/supabase-config.js`. Geheimschlüssel gehören ausschließlich in den lokalen, ignorierten Ordner `.codex-secrets/`.

Produktive Datenbankzugriffe erfolgen nur über `tools/supabase-mcp.mjs` beziehungsweise `tools/run-supabase-mcp.sh`. Schreibaktionen benötigen vor der Ausführung eine ausdrückliche Freigabe.

## Veröffentlichung

Ein Push auf `main` führt zuerst Namens- und Spieltests aus. Nur bei erfolgreicher Prüfung veröffentlicht GitHub Actions die Website unter `https://lw-ux.github.io/PadelPong/`.
