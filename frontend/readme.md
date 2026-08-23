# CampusVerse Frontend

React/TypeScript web application for CampusVerse. It provides role-aware dashboards for students, professors, administrators, and placement managers and calls the FastAPI backend through /api.

## Features

- Password registration/login/logout and optional Google login.
- Student views for attendance, assignments, profile, fees, certificates, events, resources, scholarships, complaints, marketplace, Connect, and AI assistance.
- Professor views for academics, attendance, assignments, resources, reviews, and profile management.
- Admin views for users, fees, attendance settings, certificates, announcements, and platform administration.
- Placement manager views for roles, applicants, decisions, and resumes.
- Responsive layouts, themes, Radix UI components, animations, charts, notifications, mobile navigation, public certificate verification, and protected downloads.
- Optional browser voice commands and face-template capture where supported.

## Technology and structure

React 19, TypeScript, Vite, TanStack Start/Router/React Query, Tailwind CSS 4, Radix UI, React Hook Form, Zod, Framer Motion, Recharts, Vitest, Testing Library, and Playwright.

~~~text
frontend/
├── src/routes/          # File-based pages and role layouts
├── src/components/      # Shared and UI components
├── src/lib/             # API, auth, session, and browser helpers
├── src/router.tsx       # Router setup
├── src/routeTree.gen.ts # Generated; do not edit manually
├── tests/               # End-to-end tests
└── package.json
~~~

## Prerequisites and installation

Install Node.js 20+ and npm:

~~~bash
cd frontend
npm install
~~~

## Run locally

Start the backend in one terminal and the frontend in another:

~~~bash
npm run dev -- --host 0.0.0.0 --port 5173
~~~

Open http://localhost:5173. For a production-style local build:

~~~bash
npm run preview -- --host 0.0.0.0 --port 8080
~~~

Preview builds TanStack Start output and serves it through Wrangler at http://localhost:8080.

## Main routes

| Route | Purpose |
|---|---|
| / | Landing page |
| /login | Login and Google authentication |
| /role | Role selection/navigation |
| /app | Student application/dashboard |
| /professor | Professor dashboard |
| /admin | Administrator dashboard |
| /placement | Placement manager dashboard |
| /verify/:hash | Public certificate verification |

Most /app/* pages require a valid backend JWT.

## Commands

| Command | Description |
|---|---|
| npm run dev | Development server with hot reload |
| npm run build | Production build |
| npm run build:dev | Development-mode build |
| npm run preview | Build and run Wrangler preview |
| npm run test | Run Vitest once |
| npm run test:watch | Run Vitest in watch mode |
| npm run test:e2e | Run Playwright end-to-end tests |
| npm run test:e2e:ui | Playwright interactive UI |
| npm run test:integration | Integration Playwright suite |
| npm run lint | Run ESLint |
| npm run format | Format with Prettier |

## Testing and development

~~~bash
npm run test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
~~~

Playwright starts the API and frontend using playwright.config.ts; both packages must be installed and the backend Python environment must exist. Add pages under src/routes/, use existing API/session helpers, keep route guards in place, and never edit src/routeTree.gen.ts manually.

## Troubleshooting

- **Data requests fail:** confirm the backend is running on port 8000 and the frontend API base URL ends in /api.
- **CORS errors:** set backend FRONTEND_ORIGIN to the browser origin (http://localhost:5173 or http://localhost:8080) and restart the API.
- **Configuration changes are ignored:** restart Vite and clear stale browser sessions/JWTs.
- **Google login unavailable:** configure matching backend GOOGLE_CLIENT_ID and frontend VITE_GOOGLE_CLIENT_ID, and register the local origin with Google.
- **Preview fails:** run npm run build to reveal bundling errors, then run npm install.
- **Playwright cannot start the backend on Windows:** the checked-in config uses a Unix-style Python path. Run the backend manually on port 8000 or adapt it to .venv\Scripts\python.exe.
- **Voice/face features fail:** grant microphone/camera permissions and use a browser/device supporting the relevant APIs and secure-context requirements.

See ../backend/README.md for API setup and backend configuration.
