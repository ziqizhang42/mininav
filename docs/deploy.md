# VPS Deployment

This is the minimum production deployment for one Ubuntu VPS. Caddy serves the React build, obtains HTTPS certificates, and proxies `/api/*` to Django. Django, PostGIS, and Nominatim are not exposed publicly.

## 1. Prepare the VPS and DNS

Use an Ubuntu 26.04 LTS server.

- Add a DNS `A` record for the chosen domain or subdomain pointing to the VPS IPv4 address. Add an `AAAA` record when IPv6 is configured and reachable.
- Set up SSH key access and install system updates.
- Allow inbound SSH, HTTP, and HTTPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

1. Install Git, Docker Engine, and the Docker Compose plugin. Follow Docker's [official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/) and verify the installation:

```bash
git --version
docker --version
docker compose version
```

The production Compose file publishes only ports 80 and 443. Do not add public port mappings for Postgres, Nominatim, or Django.

## 2. Copy the application and configure secrets

Clone the repository, enter it, and create the production environment file:

```bash
git clone YOUR_REPOSITORY_URL mininav
cd mininav
cp .env.production.example .env.production
chmod 600 .env.production
```

Run the following command three times and paste a different result into each secret placeholder in `.env.production`:

```bash
openssl rand -hex 64
```

Set `DOMAIN` to the DNS name created in step 1. Do not include `https://` or a path. For example:

```dotenv
DOMAIN=nav.example.com
```

The real `.env.production` file is ignored by Git. Never commit it.

## 3. Download the Alberta OSM extract

The data directory is intentionally not stored in Git. Download the current Alberta extract directly onto the VPS:

```bash
mkdir -p data/osm
curl --fail --location \
  --output data/osm/alberta-latest.osm.pbf \
  https://download.geofabrik.de/north-america/canada/alberta-latest.osm.pbf
ls -lh data/osm/alberta-latest.osm.pbf
```

The same file is used for Nominatim search and the routing graph.

## 4. Validate the deployment configuration

All subsequent Compose commands use the production file and environment file:

```bash
docker compose \
  --env-file .env.production \
  --file compose.prod.yaml \
  config --quiet
```

This command should finish without output.

## 5. Import Nominatim

Start PostGIS and Nominatim first:

```bash
docker compose \
  --env-file .env.production \
  --file compose.prod.yaml \
  up --detach db nominatim
```

Follow the Nominatim log while it performs its one-time import:

```bash
docker compose \
  --env-file .env.production \
  --file compose.prod.yaml \
  logs --follow nominatim
```

The initial import can take a while. Leave it running until Nominatim reports that its web service is ready, then press Ctrl-C to stop following the log. This does not stop the container.

## 6. Initialize Django and routing data

Run the schema migrations:

```bash
docker compose \
  --env-file .env.production \
  --file compose.prod.yaml \
  run --rm backend \
  uv run python manage.py migrate
```

Import the Alberta routing graph:

```bash
docker compose \
  --env-file .env.production \
  --file compose.prod.yaml \
  run --rm backend \
  uv run python manage.py import_osm_graph \
  --file /data/osm/alberta-latest.osm.pbf
```

Run Django's deployment checks:

```bash
docker compose \
  --env-file .env.production \
  --file compose.prod.yaml \
  run --rm backend \
  uv run python manage.py check --deploy
```

The check may warn that HSTS and Django's own SSL redirect are not enabled.
Caddy performs the HTTP-to-HTTPS redirect. Enable HSTS only after the HTTPS deployment has been tested successfully.

## 7. Start and verify the application

Build and start the complete stack:

```bash
docker compose \
  --env-file .env.production \
  --file compose.prod.yaml \
  up --detach --build
```

Check the containers:

```bash
docker compose \
  --env-file .env.production \
  --file compose.prod.yaml \
  ps
```

Open `https://YOUR_DOMAIN` in a browser. Confirm that:

1. The map appears.
2. Place search returns Alberta results.
3. A route can be calculated.
4. Current location works on a phone after granting location permission.

If HTTPS does not come up, check that the DNS record points to the VPS and that ports 80 and 443 are reachable, then inspect the frontend logs:

```bash
docker compose \
  --env-file .env.production \
  --file compose.prod.yaml \
  logs frontend
```

## 8. Update an existing deployment

Pull the latest commit:

```bash
cd /path/to/mininav
git status --short
git pull --ff-only origin main
```

Build the updated application images, apply any database migrations, and recreate the changed containers:

```bash
docker compose \
  --env-file .env.production \
  --file compose.prod.yaml \
  build

docker compose \
  --env-file .env.production \
  --file compose.prod.yaml \
  run --rm backend \
  uv run python manage.py migrate

docker compose \
  --env-file .env.production \
  --file compose.prod.yaml \
  up --detach
```

Running migrations is safe when a release has none; Django reports that there are no migrations to apply. Verify the updated containers:

```bash
docker compose \
  --env-file .env.production \
  --file compose.prod.yaml \
  ps
```

## Important data warning

The PostGIS routing database, Nominatim database, and Caddy certificates live in named Docker volumes. `docker compose down` preserves them. Do not run `docker compose down --volumes` unless the intention is to erase both imported databases and rebuild them.
