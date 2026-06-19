# Development Setup

## Prerequisites

- Docker Desktop

## First-Time Setup

```bash
docker compose up --build
docker compose exec backend uv run python manage.py migrate
docker compose exec backend uv run python manage.py check
```

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
docker compose up # --build if dependencies/Dockerfile changed
docker compose exec backend uv run python manage.py migrate # new migrations

docker compose exec db psql -U mininav -d mininav # access database
```

## Notes

Do not run backend commands directly with local uv unless you intentionally want to set up the native GIS
dependencies on your machine.
