# CampusVerse Backend

FastAPI backend for CampusVerse authentication and the student dashboard.

## Run Locally

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Redis and Celery are wired for production-style async work:

```powershell
redis-server
celery -A app.workers.celery_app.celery_app worker --loglevel=info
```

Demo student account seeded on first run:

- Email: `student@campusverse.edu`
- Password: `student123`

For real Google login, set `GOOGLE_CLIENT_ID` in `.env` and in the frontend as
`VITE_GOOGLE_CLIENT_ID`.
