# Online Course Registration — DevOps Mini Project

A three-tier course-registration web application enhanced with containerisation, CI/CD, health checks, cloud image delivery and production-monitoring hooks.

## Application stack

| Layer | Technology | Container |
|---|---|---|
| Frontend | HTML, CSS, JavaScript, Nginx | `frontend` |
| Backend | Node.js, Express, JWT, bcrypt | `backend` |
| Database | PostgreSQL 16 | `db` |

Nginx serves the frontend and proxies `/api/*` requests to Express. PostgreSQL data is persisted in a Docker volume.

## Application features

- **Student:** create an account, log in, browse courses and remaining seats, register, view registrations and drop a registration.
- **Admin:** manage courses, inspect students and registrations, register a student, and remove registrations.
- Fourteen sample courses and the admin account are seeded on first startup.

## DevOps features added

- **GitHub Actions CI:** runs on pushes, pull requests and manual workflow dispatch.
- **Automated smoke test:** builds and starts the full Docker Compose stack, waits for the API health endpoint, checks database connectivity and checks the frontend responds.
- **Containerisation:** separate backend and frontend Docker images; PostgreSQL runs as a separate service.
- **Health checks:** PostgreSQL, backend and frontend health checks are defined in Compose and Docker. `/api/health` returns application status, database status, timestamp and the deployed `APP_VERSION`; it returns HTTP 503 if PostgreSQL cannot be reached.
- **Container registry:** successful pushes to `main` build and publish commit-SHA and `latest` images to GitHub Container Registry (GHCR).
- **Continuous delivery (optional):** configure Render deploy hooks and production URLs as described below. Without those settings, CI and GHCR publishing still run; cloud deployment is skipped.
- **Observability:** application startup/errors are written to container logs, health checks can be used by an uptime monitor, and deploy verification checks the running version before declaring success.

## Run locally

Requirements: Docker Desktop or Docker Engine with the Compose plugin.

```bash
cp .env.example .env
# Edit .env and replace the sample passwords/secrets.
docker compose up --build -d
docker compose ps
curl http://localhost:8080/api/health
```

Open **http://localhost:8080**.

The health response should look similar to:

```json
{
  "status": "ok",
  "db": "up",
  "version": "local",
  "timestamp": "2026-01-01T00:00:00.000Z"
}
```

The timestamp and version will differ. The admin login is configured by `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`; change both before exposing the app to a network.

## CI/CD setup on GitHub

1. Push the repository to GitHub and use `main` as the deployment branch.
2. The `CI-CD` workflow builds the stack and runs the integration smoke test for pushes and pull requests.
3. On a successful push to `main`, GitHub Actions publishes:
   - `ghcr.io/<owner>/course-registration-backend:<commit-sha>`
   - `ghcr.io/<owner>/course-registration-frontend:<commit-sha>`
   - matching `:latest` tags.
4. Images are built only after the smoke test passes. The SHA tag identifies the exact source revision.

The workflow uses the built-in `GITHUB_TOKEN`; grant the workflow `packages: write` permission as configured in the YAML. For public Render pulls, set the GHCR packages to public after the first successful publish.

## Optional Render continuous delivery

Create two Render **Docker image** web services pointing to the GHCR backend and frontend images. Configure environment variables on the backend service for `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `APP_VERSION`. Use a managed PostgreSQL database reachable by the backend; do not use the local Compose `db` hostname in cloud configuration. Configure the frontend service to expose port 80.

Add these in GitHub repository settings:

**Actions secrets**
- `RENDER_BACKEND_DEPLOY_HOOK` — deploy hook URL for the backend image service.
- `RENDER_FRONTEND_DEPLOY_HOOK` — deploy hook URL for the frontend image service.

**Actions variables**
- `PRODUCTION_API_URL` — base URL of the deployed backend, without `/api/health`.
- `PRODUCTION_FRONTEND_URL` — public frontend base URL.

If the hooks are absent, the workflow intentionally skips cloud deployment. If production URLs are set, it verifies that the API returns healthy status, database connectivity and the current commit SHA, and that the frontend responds. The backend image embeds the commit SHA as `APP_VERSION` at build time, so the health endpoint can verify the exact deployed revision.

For production, use a strong unique `JWT_SECRET`, strong admin credentials, TLS database connections and secret storage. Never commit `.env` or deploy credentials.

## Basic monitoring / SRE

- Configure an uptime service such as UptimeRobot to request `https://<api-host>/api/health` at a regular interval and alert on non-2xx responses.
- Monitor the backend and frontend service logs in the hosting platform. The backend emits a startup log with version and timestamp; runtime errors are written to standard error.
- The API health endpoint checks PostgreSQL as well as the Node process. This detects the case where the server is running but the database is unavailable.
- Example availability objective: **99% monthly API health-check availability**. For a 30-day month, a 1% error budget is about 7.2 hours. Treat this as a target, not as measured uptime.
- For incidents, use the deployment SHA and service logs to identify the version, diagnose the issue, redeploy the last known-good image, and record a blameless postmortem.

## Useful commands

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose ps
docker compose down
docker compose down -v   # also deletes the local PostgreSQL volume/data
```

## API overview

| Method | Endpoint | Access |
|---|---|---|
| POST | `/api/signup`, `/api/login` | Public |
| GET | `/api/courses` | Authenticated |
| POST/DELETE | `/api/courses`, `/api/courses/:id` | Admin |
| POST | `/api/register` | Student |
| GET/DELETE | `/api/my-registrations`, `/api/my-registrations/:id` | Student |
| GET | `/api/registrations`, `/api/students` | Admin |
| POST | `/api/admin/register` | Admin |
| GET | `/api/health` | Public readiness check |

## Project structure

```text
├── .github/workflows/ci-cd.yml
├── .env.example
├── docker-compose.yml
├── db/init.sql
├── backend/
│   ├── Dockerfile
│   └── server.js
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    └── HTML/CSS/JavaScript assets
```
