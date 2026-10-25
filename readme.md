# Snapzilla

Dark-mode webplatform voor het **opslaan**, **organiseren**, **bekijken** en **analyseren** van screenshots. Een **Windows capture-client** stuurt captures direct naar de server; opslag en API via **PocketBase** (open, geen login op de collections).

## Architectuur

| Onderdeel | Rol |
|-----------|-----|
| **PocketBase** | Bestanden + metadata (`screenshots`, `albums`) |
| **Web (nginx)** | Gallery UI + proxy `/api` → PocketBase |
| **Analyzer** | Achtergrond: afmetingen, pHash, kleuren |
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

## Snel starten (Docker)

Vergelijkbaar met [fileshare](https://github.com/s4ndyp/fileshare): één `docker compose` op je Proxmox LXC.

```bash
git clone https://github.com/s4ndyp/snapzilla.git
cd snapzilla
cp .env.example .env
docker compose up -d --build
```

- Web-UI: `http://<host>:3000` (of poort uit `.env`, bv. `80` → `http://<host>/`)
- PocketBase admin (eerste setup): `http://<host>:3000/_/` (zelfde poort als de UI)

### Client op een andere PC (LAN)

1. Op de server: in `.env` de poort zetten die extern bereikbaar is (`SNAPZILLA_PORT=80` als de site op 80 draait).
2. Firewall/LXC: die poort open voor je LAN.
3. Test vanaf de client-PC in de browser: `http://<server-ip>/api/health`.
4. In de Windows-client: **zelfde basis-URL** (geen `:3000` als de site op 80 staat). Gebruik **Test / zoek server** — de client probeert ook poort 80 en 3000.

Collecties worden automatisch aangemaakt via `pocketbase/pb_migrations/`.

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
