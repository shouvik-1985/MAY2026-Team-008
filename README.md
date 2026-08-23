# CampusVerse

CampusVerse is a full-stack campus management platform with dedicated dashboards for **students**, **professors**, **admins** and **placement partners** — covering attendance, assignments, placements, study resources, complaints, a campus marketplace, announcements, and an AI-powered student assistant.

---

## Tech Stack

### Frontend (Web Dashboard)
- **React 19** + **Vite 8**
- **TanStack Start** + **TanStack Router** (file-based routing) + **TanStack React Query**
- **Tailwind CSS 4** + **shadcn/ui** (built on **Radix UI** primitives)
- **Framer Motion** + **Lenis** (smooth scroll)
- **React Hook Form** + **Zod** (forms & validation)
- **Recharts**, **Embla Carousel**, **cmdk**, **Sonner**
- **TypeScript**
- Browser-native APIs: **Web Speech API** (voice commands), **Shape Detection API** (face-based attendance capture)
- Testing: **Vitest**, **Testing Library**, **Playwright**

### Backend
- **FastAPI** (Python) + **Uvicorn**
- **SQLAlchemy 2.x** — **PostgreSQL** in production (via `psycopg2`), **SQLite** supported for local dev/tests
- Schema is created and auto-migrated in code on startup (no Alembic)
- **JWT Authentication** (`PyJWT`) with PBKDF2-HMAC-SHA256 password hashing
- **Google OAuth login** (`google-auth`)
- **Redis** + **Celery** (background tasks — emails, notifications, login audit)
- **OpenAI API** (`gpt-5.4-mini`) — powers the Student AI Assistant, assignment review, and resource AI features
- **Razorpay** — payments
- **ReportLab** + **pypdf** — certificate/PDF generation
- Testing: **pytest** + FastAPI's `TestClient`

---

## Project Structure

```
campusverse/
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app entrypoint
│   │   ├── db.py              # DB engine, session, schema creation/auto-migration
│   │   ├── models.py          # SQLAlchemy models
│   │   ├── schemas.py         # Pydantic request/response schemas
│   │   ├── seed.py            # Demo data seeding
│   │   ├── core/
│   │   │   ├── config.py      # Settings (env vars)
│   │   │   └── security.py    # JWT + password hashing
│   │   ├── routers/           # admin, auth, complaints, connect, marketplace,
│   │   │                      # placement, professor, resources, student
│   │   ├── services/          # AI assistant, Redis client, etc.
│   │   └── workers/           # Celery app + background tasks
│   ├── tests/                 # pytest suite
│   └── requirements.txt
│
└── frontend/
    ├── src/
    │   ├── routes/             # TanStack file-based routes (student/professor/admin/placement manager)
    │   ├── lib/                # API client, voice-command, face-template, utils
    │   └── components/         # shadcn/ui + shared components
    ├── tests/
    └── package.json
```

---

## Prerequisites

- **Node.js 20+**
- **Python 3.11+** (tested on 3.12 / 3.13)
- **PostgreSQL 16+** (or SQLite for local development — no setup needed)
- **Redis** (for caching + Celery background tasks)
- An **OpenAI API key** (for AI assistant features)
- *(Optional)* Google OAuth Client ID, Razorpay keys — only needed if you use Google sign-in or payments

---

The backend API runs on **port 8000** and the frontend on **port 8080** in both setups below.

## Setup on Ubuntu / macOS

### Backend

1. **Clone the repository**
   ```bash
   git clone https://github.com/shouvik-1985/MAY2026-Team-008.git
   cd backend
   ```

2. **Create and activate a virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **(Optional) Start Redis and a Celery worker** for background tasks (welcome emails, notifications), each in its own terminal:
   ```bash
   redis-server
   celery -A app.workers.celery_app worker --loglevel=info
   ```

5. **Start the backend**
   ```bash
   uvicorn app.main:app --reload
   ```
   - API: `http://localhost:8000`
   - Interactive docs (Swagger UI): `http://localhost:8000/docs`

### Frontend

1. **Open a new terminal and navigate to the frontend folder**
   ```bash
   cd MAY2026-Team-008/frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the frontend application**
   ```bash
   npm run preview -- --host 0.0.0.0 --port 8080
   ```

The application can be accessed at: **http://localhost:8080**

---

## Setup on Windows

### Backend

1. **Clone the repository**
   ```powershell
   git clone https://github.com/shouvik-1985/MAY2026-Team-008.git
   cd backend
   ```

2. **Create and activate a virtual environment**
   ```powershell
   python -m venv venv
   venv\Scripts\activate
   ```
   *(If using PowerShell and activation is blocked, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` first, or activate via `venv\Scripts\activate.bat` in Command Prompt instead.)*

3. **Install dependencies**
   ```powershell
   pip install -r requirements.txt
   ```

4. **(Optional) Start Redis and a Celery worker** for background tasks. Redis doesn't run natively on Windows — use **WSL**, **Memurai**, or **Docker** (`docker run -p 6379:6379 redis`) to host it, then in its own terminal:
   ```powershell
   celery -A app.workers.celery_app worker --loglevel=info
   ```

5. **Start the backend**
   ```powershell
   uvicorn app.main:app --reload
   ```
   - API: `http://localhost:8000`
   - Interactive docs (Swagger UI): `http://localhost:8000/docs`

### Frontend

1. **Open a new terminal and navigate to the frontend folder**
   ```powershell
   cd frontend
   ```

2. **Install dependencies**
   ```powershell
   npm install
   ```

3. **Start the frontend application**
   ```powershell
   npm run preview -- --host 0.0.0.0 --port 8080
   ```

The application can be accessed at: **http://localhost:8080**

---

## Available Scripts

### Backend
| Command | Description |
|---|---|
| `uvicorn app.main:app --reload` | Start the API server with hot reload |
| `pytest` | Run the backend test suite |
| `celery -A app.workers.celery_app worker --loglevel=info` | Start the Celery worker |

### Frontend
| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server (hot reload, default port 5173) |
| `npm run build` | Production build |
| `npm run preview -- --host 0.0.0.0 --port 8080` | Build and serve the production build (used above, port 8080) |
| `npm run test` | Run unit tests (Vitest) |
| `npm run test:e2e` | Run end-to-end tests (Playwright) |
| `npm run lint` | Lint the codebase |
| `npm run format` | Format with Prettier |

> `npm run dev` is fastest for day-to-day development (hot reload on port 5173). `npm run preview` builds the app first and serves the production build — use this for the setup steps above, testing the app the way it'll actually run in production, or accessing it from another device on your network via `--host 0.0.0.0`.

---

## Core Features

- **Student Dashboard** — attendance, assignments, CGPA/academic standing, fee invoices, certificate requests, event registrations, complaints, campus marketplace, "Connect" messaging, AI assistant chat
- **Professor Dashboard** — student roster, grading, attendance oversight, class analytics, announcements
- **Admin Dashboard** — user management, fee/attendance settings, platform-wide analytics, placement role management
- **Placements** — role postings, student applications, notifications
- **AI Assistant** — OpenAI-powered chat for student queries, assignment review assistance, resource summarization
- **Biometric / Voice Features** — browser-based face capture and voice commands (no external ML service required)
- **Certificates** — PDF generation (bonafide, merit, conduct, etc.) via ReportLab

---
