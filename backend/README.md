# CampusVerse Backend

FastAPI backend for the CampusVerse campus-management platform. It provides authentication, role-based dashboards, academic workflows, placement management, file handling, and integrations used by the frontend.

## Features

- Password and Google OAuth login with JWT authentication and PBKDF2 password hashing.
- Student APIs for attendance, academics, assignments, fees, certificates, events, resources, scholarships, complaints, marketplace, Connect, and AI assistance.
- Professor APIs for academics, attendance, assignments, resources, reviews, and profiles.
- Admin APIs for users, announcements, fees, attendance settings, certificates, and platform management.
- Placement roles/applications, marketplace listings and payments, PDF generation, uploads, Redis/Celery tasks, and optional OpenAI features.

## Technology and structure

Python 3.11+, FastAPI, Uvicorn, SQLAlchemy 2.x, SQLite/PostgreSQL, Pydantic Settings, PyJWT, Google Auth, Redis, Celery, ReportLab, pypdf, and pytest.

~~~text
backend/
├── app/main.py       # Entrypoint, startup, CORS, health check
├── app/db.py         # Database engine and sessions
├── app/models.py     # SQLAlchemy models
├── app/schemas.py    # Pydantic schemas
├── app/seed.py       # Demo data/accounts
├── app/core/         # Configuration and security
├── app/routers/      # Auth, student, professor, admin, placement, etc.
├── app/services/     # Redis and AI helpers
├── app/workers/      # Celery app and tasks
└── tests/            # Unit, database, and contract tests
~~~

## Prerequisites

Python 3.11+ and pip. SQLite is sufficient for local development; PostgreSQL is recommended for production. Redis is needed only for background tasks. OpenAI, Google OAuth, and Razorpay credentials are optional.

## Install

Windows PowerShell:

~~~powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
~~~

macOS/Linux:

~~~bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
~~~

If PowerShell blocks activation, run Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass, or use .venv\Scripts\activate.bat in Command Prompt.

## Database and startup behavior

Configure the database and integrations through the project’s local environment configuration. The API creates missing tables, applies built-in schema compatibility updates, seeds demo data, creates upload directories, and backfills local assets at startup. There is currently no Alembic migration workflow; back up production databases before deploying schema changes.

## Run

~~~bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
~~~

- Health: http://localhost:8000/api/health
- Swagger: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- OpenAPI JSON: http://localhost:8000/openapi.json

The frontend normally uses http://localhost:8000/api.

## Demo accounts

| Role | Email | Password |
|---|---|---|
| Student | student@campusverse.edu | student123 |
| Professor | professor@campusverse.edu | professor123 |
| Administrator | admin@campusverse.edu | admin123 |
| Placement manager | placementpartner@gmail.com | manager#123 |

These are for local development only.

## Redis and Celery

~~~bash
redis-server
celery -A app.workers.celery_app.celery_app worker --loglevel=info
~~~

On Windows use WSL, Docker, or a Redis-compatible service. Example: docker run --name campusverse-redis -p 6379:6379 -d redis.

## Testing

~~~bash
pytest
pytest tests/unit_tests/test_login_api.py -q
pytest tests/database_tests -q
~~~

Tests use a temporary SQLite database and test environment values.

## Troubleshooting

- **Missing database/config:** verify that the backend database configuration is available and that relative SQLite paths are used from backend/.
- **CORS/network errors:** run the API on port 8000 and set FRONTEND_ORIGIN to the exact browser origin.
- **AI unavailable:** configure OPENAI_API_KEY and restart; fallback responses are used when live AI is unavailable.
- **Google login fails:** use the same client ID in backend GOOGLE_CLIENT_ID and frontend VITE_GOOGLE_CLIENT_ID, with the local origin registered.
- **Payments fail:** configure valid Razorpay test-mode keys.
- **Celery does not process jobs:** verify Redis is reachable and start the worker from backend/ with .venv activated.
- **Uploads disappear:** ensure the process can write to the upload directory and use persistent storage in deployments.

For production use PostgreSQL, HTTPS, a strong random JWT secret, trusted origins, persistent uploads, non-demo credentials, and separate API/Celery processes.
