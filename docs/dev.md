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
docker compose run --rm --no-deps frontend npm run format
docker compose run --rm --no-deps frontend npm run check

# New frontend dependency
docker compose run --rm --no-deps frontend npm install <package>
docker compose build frontend

# Backend checks
docker compose run --rm --no-deps backend uv run ruff check --fix .
docker compose run --rm --no-deps backend uv run ruff format .

# With e2e tests
docker compose up --build --abort-on-container-exit --exit-code-from e2e e2e

docker compose down

# Resetting local data
docker compose down --volumes # deletes container and volumes, including database data
```

## Notes

Do not run backend commands directly with local uv unless you intentionally want to set up the native GIS dependencies on your machine.

- frontend/src/**/*.test.tsx: Vitest component/unit tests
- frontend/e2e/**/*.spec.ts: Playwright browser tests

When upgrading Playwright, keep the @playwright/test version in frontend/package.json aligned with the image version in frontend/Dockerfile.e2e.

Current intended structure of frontend/src/:
- components/: reusable presentation components.
- features/: domain-specific components and hooks.
- pages/: URL-level screens.
- lib/: infrastructure (such as HTTP utilities).
- app/: app-wide providers and configuration.
- test/: shared test setup.
