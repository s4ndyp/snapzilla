# Snapzilla

Dark-mode webplatform voor het **opslaan**, **organiseren**, **bekijken** en **analyseren** van screenshots. Een **Windows capture-client** stuurt captures direct naar de server; opslag en API via **PocketBase** (open, geen login op de collections).

## Architectuur

| Onderdeel | Rol |
|-----------|-----|
| **PocketBase** | Bestanden + metadata (`screenshots`, `albums`) |
| **Web (nginx)** | Gallery UI + proxy `/api` → PocketBase |
| **Analyzer** | Achtergrond: afmetingen, pHash, kleuren, tekst via **OpenRouter** (vision) |
| **Windows-client** | Systeemvak, hotkeys, upload naar REST API |

## Features

### Web

- Grid-gallery met thumbnails, lightbox, toetsenbordnavigatie
- Zoeken op titel, OCR-veld, tags, client, notities
- Tags, albums, filter op client, favorieten, duplicaat-hints (pHash)
- Bulk: selecteren, taggen, favoriet, verwijderen
- Drag & drop, plakken (Ctrl+V), browser-upload
- Tijdlijn per dag, sorteeropties
- Notities per screenshot in lightbox

### Client (Windows)

- Systeemvak + ballonmeldingen
- Volledig scherm, actief venster, regio-selectie
- Instellingen: server-URL, clientnaam, start met Windows
- Installer via GitHub Actions (Inno Setup)

### Analyse (server)

- Breedte/hoogte, bestandsgrootte
- Dominante kleur
- Perceptual hash voor duplicaten
- **Tekst uit screenshots** via OpenRouter (vision-model); opgeslagen in `ocr_text`, doorzoekbaar in de gallery. Web-UI: **OCR aan/uit**, **Model …** (model + API-key). Key kan in de GUI of via `.env` (`OPENROUTER_API_KEY`).

## Snel starten (Docker)

Vergelijkbaar met [fileshare](https://github.com/s4ndyp/fileshare): één `docker compose` op je Proxmox LXC.

```bash
git clone https://github.com/s4ndyp/snapzilla.git
cd snapzilla
cp .env.example .env
docker compose up -d --build
# OpenRouter-key: in de UI onder Model …, of OPENROUTER_API_KEY in .env
```

Lokale poort/tweaks: `docker-compose.override.yml` (zie `docker-compose.override.example.yml`), niet `docker-compose.yml` handmatig wijzigen.

### Server updaten (na merge naar `main`)

Eén commando in de clone-map (bijv. `/opt/snapzilla`):

```bash
bash scripts/update.sh
```

Dat doet: `git pull`, `docker compose up -d --build`, PocketBase-migraties (o.a. OCR-instellingen). Daarna in de browser **Ctrl+F5**. De **Windows-client** hoeft niet opnieuw geïnstalleerd — alleen de server-URL blijft hetzelfde.

- Web-UI: `http://<host>:3000` (of poort uit `.env`, bv. `80` → `http://<host>/`)
- PocketBase admin (eerste setup): `http://<host>:3000/_/` (zelfde poort als de UI)

### Client op een andere PC (LAN)

1. Op de server: in `.env` de poort zetten die extern bereikbaar is (`SNAPZILLA_PORT=80` als de site op 80 draait).
2. Firewall/LXC: die poort open voor je LAN.
3. Test vanaf de client-PC in de browser: `http://<server-ip>/api/health`.
4. In de Windows-client: **zelfde basis-URL** (geen `:3000` als de site op 80 staat). Gebruik **Test / zoek server** — de client probeert ook poort 80 en 3000.

Collecties komen uit `pocketbase/pb_migrations/` (toegepast via `scripts/update.sh` / `pb-migrate.sh`).

### Tekst / OCR (OpenRouter)

In de web-UI: **Model …** → **OpenRouter API-key** opslaan (met test vóór opslaan), **Key testen**, **OCR-test (key + model)**, actief model kiezen, modellen installeren. Alles in PocketBase (`snapzilla_settings`).

Alternatief of fallback in `/opt/snapzilla/.env`:

```env
OPENROUTER_API_KEY=sk-or-v1-...
# OPENROUTER_MODEL=google/gemini-2.0-flash-001
```

**Let op:** zonder PocketBase-login is de key via de API leesbaar voor iedereen op je netwerk — alleen op een vertrouwd LAN gebruiken.

Daarna `bash scripts/update.sh` of `docker compose up -d --build analyzer`.

In de galerij: badges **Bezig…** / **OCR…** / **Gelukt** / **Geen tekst** / **Mislukt** / **Geen API-key**. Afmetingen en pHash worden direct gezet (`analyzed=true`); tekst volgt via OpenRouter (enkele seconden). Met **OCR aan** worden ook oudere shots zonder tekst opgepikt (backfill).

```bash
docker compose ps          # snapzilla-analyzer moet Up zijn
docker compose logs -f analyzer --tail=50
```

Verwacht o.a. `[ocr] OpenRouter model=…` en `[analyze] … ocr=done`. Blijft **Bezig…** staan zonder **OCR…**, dan draait de analyzer niet (vroeger blokkeerde een kapotte `ocr`-container de hele stack).

### OCR uitschakelen

Knop **OCR uit** in de web-UI, of laat `OPENROUTER_API_KEY` leeg (analyzer slaat tekst over; screenshots worden wel geanalyseerd).

## Windows-client

Zie ook `/client-setup.html` op de server.

1. Download `SnapzillaSetup.exe` uit [Releases](https://github.com/s4ndyp/snapzilla/releases) (build bij merge naar `main`).
2. Server-URL instellen — basis-URL van de web-UI (poort 80: geen `:3000`, bv. `http://10.5.0.153`).
3. Na capture: preview → **Upload** of **Lokaal opslaan**; bij problemen **Logboek openen** in instellingen.

Hotkeys:

- `Ctrl+Shift+F11` — volledig scherm
- `Ctrl+Shift+F12` — actief venster
- `Ctrl+Shift+S` — regio

## CI/CD

- **`.github/workflows/docker.yml`** — bij push naar `main`: images `ghcr.io/s4ndyp/snapzilla-web` en `snapzilla-analyzer`.
- **`.github/workflows/client-windows.yml`** — Windows-installer als artifact + release.

`docker-compose.yml` bouwt lokaal; op de server kun je desgewenst de GHCR-images gebruiken door `build:` te vervangen door `image:`.

## Ontwikkeling

```bash
docker compose up -d --build
# logs analyzer
docker compose logs -f analyzer
```

Client lokaal (Windows):

```bash
cd client
dotnet run --project Snapzilla.Client
```

## Licentie

MIT (voorstel — pas aan indien gewenst).
