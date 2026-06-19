# Development Setup

## Prerequisites

- Docker Desktop

## First-Time Setup

```bash
docker compose up --build --detach
docker compose exec backend uv run python manage.py migrate
docker compose exec backend uv run python manage.py check
```

Web frontend will be available at: localhost:5173
The Django backend will be available at: localhost:8000
The PostGIS database is available on: localhost:5432

Default local database credentials:
DB_NAME=mininav
DB_USER=mininav
DB_PASSWORD=mininav
DB_HOST=db
DB_PORT=5432

## Repeated Development

```bash
docker compose up --detach # --build if dependencies/Dockerfile changed
docker compose exec backend uv run python manage.py migrate # new migrations

docker compose exec db psql -U mininav -d mininav # access database

# Frontend checks
docker compose run --rm --no-deps frontend npm run lint
docker compose run --rm --no-deps frontend npm run build

# New frontend dependency
docker compose run --rm --no-deps frontend npm install <package>
docker compose build frontend

docker compose down

# Resetting local data
docker compose down --volumes # deletes container and volumes, including database data
```

## Notes

Do not run backend commands directly with local uv unless you intentionally want to set up the native GIS
dependencies on your machine.
