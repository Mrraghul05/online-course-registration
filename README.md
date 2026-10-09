# Online Course Registration — DevOps Mini Project

A three-tier course-registration web application enhanced with Docker containerisation, CI/CD, health checks, container registry publishing, and monitoring.

## Application Stack

| Layer    | Technology                    | Container  |
| -------- | ----------------------------- | ---------- |
| Frontend | HTML, CSS, JavaScript, Nginx  | `frontend` |
| Backend  | Node.js, Express, JWT, bcrypt | `backend`  |
| Database | PostgreSQL 16                 | `db`       |

Nginx serves the frontend and proxies `/api/` requests to Express. PostgreSQL data is persisted in a Docker volume.

## Application Features

**Student**

* Create an account and log in.
* Browse courses and remaining seats.
* Register for courses.
* View and drop registrations.

**Admin**

* Manage courses.
* View students and registrations.
* Register students for courses and remove registrations.

Fourteen sample courses and the admin account are seeded on first startup.

## DevOps Features

* **Docker:** Separate frontend and backend images, with PostgreSQL running as a separate service.
* **GitHub Actions CI/CD:** Runs on pushes, pull requests, and manual workflow dispatch.
* **Automated smoke tests:** Builds and starts the Docker Compose stack, checks API health, and verifies the frontend responds.
* **Health checks:** PostgreSQL, backend, and frontend health checks monitor service readiness. The `/api/health` endpoint checks database connectivity and returns application version and timestamp.
* **GitHub Container Registry (GHCR):** Publishes backend and frontend images tagged with the commit SHA and `latest` after successful CI on `main`.
* **Optional cloud deployment:** Render deploy hooks can trigger deployment and production verification.
* **Monitoring:** Application logs, health endpoints, and optional uptime alerts help identify failures.

## Run Locally

Requirements: Docker Desktop or Docker Engine with the Docker Compose plugin.

```bash
cp .env.example .env
```

Edit `.env` and replace all sample passwords and secrets with strong values. Then run:

```bash
docker compose config
docker compose up --build -d
docker compose ps
```

Open the application at:

http://localhost:8080

Check the API health endpoint:

http://localhost:8080/api/health

A healthy response should resemble:

```json
{
  "status": "ok",
  "db": "up",
  "version": "local",
  "timestamp": "..."
}
```

The timestamp and version depend on the running application. The admin credentials are configured through `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`.

## GitHub Actions CI/CD Setup

1. Push the repository to GitHub and use `main` as the deployment branch.
2. Open the repository's **Actions** tab.
3. The workflow builds the application and runs the integration smoke test.
4. After a successful push to `main`, the workflow publishes images to GHCR.

Expected image tags:

```text
ghcr.io/<owner>/course-registration-backend:<commit-sha>
ghcr.io/<owner>/course-registration-backend:latest
ghcr.io/<owner>/course-registration-frontend:<commit-sha>
ghcr.io/<owner>/course-registration-frontend:latest
```

The workflow requires appropriate package permissions, including `packages: write`, for publishing images.

## Optional Render Deployment

For cloud deployment, configure backend and frontend services to use the published GHCR images and configure a managed PostgreSQL database.

Set the backend environment variables required by the application, including:

* `DB_HOST`
* `DB_USER`
* `DB_PASSWORD`
* `DB_NAME`
* `JWT_SECRET`
* `ADMIN_EMAIL`
* `ADMIN_PASSWORD`
* `APP_VERSION`

Use the managed database's actual connection details rather than the local Compose hostname `db`.

Configure these GitHub repository secrets if the workflow supports Render deploy hooks:

* `RENDER_BACKEND_DEPLOY_HOOK`
* `RENDER_FRONTEND_DEPLOY_HOOK`

Configure these repository variables for production verification:

* `PRODUCTION_API_URL`
* `PRODUCTION_FRONTEND_URL`

Cloud deployment is optional; CI and image publishing can run independently. Confirm the workflow's actual configuration before relying on automatic deployment.

## Basic Monitoring / SRE

* Configure an uptime-monitoring service to request `/api/health` and alert on failed responses.
* Review backend, frontend, and database logs.
* Use the application version and commit SHA to identify the deployed release.
* Example availability objective: **99% monthly API health-check availability**. In a 30-day month, this corresponds to approximately 7.2 hours of downtime allowance. This is a target, not measured uptime.
* During incidents, investigate logs, redeploy a known-good release if necessary, and document the cause and resolution.

Useful commands:

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
docker compose ps
docker compose down
```

To delete the local database volume and its data as well:

```bash
docker compose down -v
```

**Warning:** The `-v` option deletes persistent local database data.

## API Overview

| Method      | Endpoint                                             | Access                 |
| ----------- | ---------------------------------------------------- | ---------------------- |
| POST        | `/api/signup`, `/api/login`                          | Public                 |
| GET         | `/api/courses`                                       | Authenticated          |
| POST/DELETE | `/api/courses`, `/api/courses/:id`                   | Admin                  |
| POST        | `/api/register`                                      | Student                |
| GET/DELETE  | `/api/my-registrations`, `/api/my-registrations/:id` | Student                |
| GET         | `/api/registrations`, `/api/students`                | Admin                  |
| POST        | `/api/admin/register`                                | Admin                  |
| GET         | `/api/health`                                        | Public readiness check |

## Project Structure

```text
├── .github/
│   └── workflows/
│       └── ci-cd.yml
├── .env.example
├── docker-compose.yml
├── db/
│   └── init.sql
├── backend/
│   ├── Dockerfile
│   └── server.js
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    └── frontend assets
```

Never commit `.env`, real credentials, or deployment secrets to GitHub.
