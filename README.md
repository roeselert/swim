# Schwimmen – Kartenspiel als PWA

Das klassische Kartenspiel **Schwimmen** (auch „31“ oder „Schnauz“) im Browser: ein menschlicher Spieler gegen zwei Computergegner. Reines HTML, CSS und JavaScript ohne Build-Schritt, installierbar und offline spielbar als Progressive Web App.

## Spielen

Lokal starten:

```sh
npm start        # http://localhost:8080
```

Oder einfach `index.html` über einen beliebigen statischen Webserver ausliefern. Der Service Worker benötigt `https://` oder `localhost`.

## Regeln (Kurzfassung)

- 32 Karten (7–Ass). 7–10 zählen ihren Wert, Bube/Dame/König 10, Ass 11.
- Es zählen nur Karten **derselben Farbe** (max. 31). Drei gleiche Werte zählen 30½, drei Asse sind **Feuer** (33).
- Der Geber sieht ein Blatt und behält es oder nimmt blind das zweite; das abgelehnte Blatt liegt offen in der Mitte.
- Pro Zug: eine Karte tauschen, alle drei tauschen, schieben oder klopfen. Schieben alle, kommen drei neue Karten in die Mitte.
- Nach dem Klopfen hat jeder andere noch einen Zug. 31 beendet die Runde sofort, Feuer kostet alle anderen sofort ein Leben.
- Wer die wenigsten Punkte hat, verliert ein Leben (3 Leben, dann „schwimmen“, dann raus). Der Letzte gewinnt.

Die vollständigen Regeln stehen in der App unter „Regeln“.

## Projektstruktur

| Datei | Inhalt |
| --- | --- |
| `index.html` | Oberfläche und Dialoge |
| `style.css` | Gestaltung (mobile-first) |
| `game.js` | Reine Spiellogik inkl. Computergegner, ohne DOM |
| `app.js` | Rendering, Eingaben, Spielstand in `localStorage`, Service-Worker-Registrierung |
| `sw.js` | Service Worker (App-Shell wird gecacht) |
| `manifest.webmanifest`, `icons/` | PWA-Manifest und Icons |
| `tests/` | Logik-Tests (`npm test`, Node ≥ 20) |

## Deployment auf GitHub Pages

Der Workflow `.github/workflows/pages.yml` führt die Tests aus und veröffentlicht bei jedem Push auf `main` das Repository-Root nach GitHub Pages.

Einmalig in den Repository-Einstellungen unter **Settings → Pages → Build and deployment → Source** die Option **GitHub Actions** wählen. Alle Pfade sind relativ, daher funktioniert die App auch unter `https://<user>.github.io/swim/`.

## Icons neu erzeugen

```sh
npm run icons    # benötigt Playwright mit Chromium
```
