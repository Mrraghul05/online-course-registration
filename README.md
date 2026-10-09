# Online Course Registration Form

A mini DevOps project: a three-tier web app, fully containerised with Docker Compose.

| Layer    | Tech                          | Container  |
|----------|-------------------------------|------------|
| Frontend | HTML, CSS, JavaScript + Nginx | `frontend` |
| Backend  | Node.js, Express, JWT, bcrypt | `backend`  |
| Database | PostgreSQL 16                 | `db`       |

Nginx serves the pages and proxies `/api/*` to the backend, so the browser only talks to port 8080.

## Features
**Student:** sign up, log in, browse courses with seats left, fill the registration form (phone, qualification), view and drop registrations.
**Admin:** log in, see all students and the courses they hold, register a student for a course, remove registrations, add or delete courses, and view every registration with student details.

14 sample courses are added automatically on first start.

## Run it
```bash
git clone <your-repo-url>
cd online-course-registration
cp .env.example .env      # then edit the passwords and JWT_SECRET
docker compose up -d --build
```
Open http://localhost:8080

Default admin (from `.env`): `admin@college.com` / `Admin@123`. Change it before deploying anywhere public.

## Useful commands
```bash
docker compose logs -f backend     # watch backend logs
docker compose down                # stop
docker compose down -v             # stop and delete database data
```

## Project structure
```
├── docker-compose.yml
├── .env.example
├── db/init.sql            # tables + sample courses
├── backend/               # Express API + Dockerfile
├── frontend/              # pages, CSS, Nginx config + Dockerfile
└── .github/workflows/ci.yml   # builds and smoke-tests on every push
```

## API
| Method | Endpoint                  | Access  |
|--------|---------------------------|---------|
| POST   | /api/signup, /api/login   | public  |
| GET    | /api/courses              | any user |
| POST/DELETE | /api/courses(/:id)   | admin   |
| POST   | /api/register             | student |
| GET/DELETE | /api/my-registrations | student |
| GET    | /api/registrations        | admin   |
| GET    | /api/students             | admin   |
| POST   | /api/admin/register       | admin   |
| DELETE | /api/registrations/:id    | admin   |
| GET    | /api/health               | public  |

## Push to GitHub
```bash
git init && git add . && git commit -m "Initial commit: course registration app"
git branch -M main
git remote add origin https://github.com/<your-username>/online-course-registration.git
git push -u origin main
```
