# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

球球写作 (QiuQiu Writer) is a full-stack AI-powered writing platform. Three separate apps:
- **frontend/** — Main user-facing app (React 19 + TypeScript + Vite, port 5173)
- **admin/** — Admin panel (React 18 + Ant Design, separate Vite app)
- **backend/** — API server (FastAPI + Python 3.10+, port 8000/8001)

## Development Commands

### Starting Services

```bash
# Start all services at once
./start.sh

# Or manually:
# Backend
cd backend && source .venv/bin/activate
uvicorn memos.api.server_api:app --host 0.0.0.0 --port 8001 --reload

# Frontend
cd frontend && npm run dev

# Admin panel
cd admin && npm run dev
```

Infrastructure (PostgreSQL, Redis, MongoDB) must be running. Start via Docker:
```bash
cd docker && docker compose up -d postgres redis mongodb
```

### Frontend

```bash
cd frontend
npm run dev       # Dev server (port 5173)
npm run build     # TypeScript compile + Vite build
npm run lint      # ESLint
npm run preview   # Preview production build (port 4173)
```

### Backend

```bash
cd backend
make install      # Install dependencies (poetry install --with extras)
make test         # Run all tests
make format       # Ruff format + fix
make serve        # Dev server
poetry run pytest tests/test_specific.py -v    # Run single test file
poetry run pytest tests/ -k "test_name" -v     # Run single test by name
```

## Architecture

### Frontend

**Entry:** `frontend/src/main.tsx` — calls `initTheme()` then renders React app.

**Routing:** `frontend/src/App.tsx` — lazy-loaded pages wrapped in `Suspense`, protected by `RequireAuth`. Uses React Router v7.

**API Communication:**
- Dev proxy in `vite.config.ts`: `/api` and `/ai` and `/v1` → `http://127.0.0.1:8000`
- API clients in `src/utils/`: `api.ts`, `authApi.ts`, `chaptersApi.ts`, `bookAnalysisApi.ts`, `chatApi.ts`
- All extend `baseApiClient.ts`

**Collaborative Editing:**
- TipTap editor with Yjs CRDT for real-time sync (`y-websocket`, `y-indexeddb`, `y-webrtc`)
- ShareDB document synchronization via WebSocket

**Theme System:** `data-theme` attribute on `<html>` element. `src/utils/theme.ts` manages persistence; all colors are CSS variables in `src/index.css` under `:root[data-theme="dark"]` / `:root[data-theme="light"]` blocks. Never hardcode colors — use CSS variables.

**Key Layout:** `MainLayout` applies `.is-homepage` when path is `/` and `.is-profile-page` when path starts with `/users/`, which activate special nav/background treatments.

### Backend

**Main app:** `backend/src/memos/api/server_api.py` — FastAPI app, registers routers, middleware, and exception handlers.

**Layer structure:**
- `routers/` — HTTP endpoint handlers (thin, delegate to services)
- `services/` — Business logic (user, work, chapter, AI, ShareDB, Yjs, book analysis)
- `models/` — SQLAlchemy ORM models (PostgreSQL)
- `schemas/` — Pydantic request/response schemas
- `api/core/config.py` — All settings via `Settings` class (loaded from `.env`)

**Databases:**
- PostgreSQL — primary relational data (users, works, chapters, documents)
- Redis — caching and sessions
- MongoDB — ShareDB document store for collaborative editing
- Qdrant — vector DB for semantic search (optional)
- Neo4j — graph DB for memory features (optional)

**AI Integration:** `llms/` directory contains providers (OpenAI, Ollama, etc.). `services/ai_service.py` orchestrates AI calls. `routers/ai_router.py` (99KB) and `routers/product_router.py` (89KB) are the largest files.

**API prefix:** All main endpoints under `/api/v1/`. AI service endpoints under `/v1/`.

**API docs:** Available at `http://localhost:8001/docs` when server is running.

## Key Conventions

- Backend uses Poetry for dependency management. Add packages with `poetry add <pkg>`.
- Frontend uses **npm** (Node ≥ 20, npm ≥ 10). `admin/` and `frontend/` have separate `node_modules` and separate `package-lock.json` files.
  - **Lockfiles MUST be committed.** `package-lock.json` is no longer in `.gitignore`.
  - Use `npm ci` for reproducible installs (CI, Docker, fresh clones). Use `npm install` only when intentionally updating dependencies.
- Python 3.10+ required. Backend virtual env at `backend/.venv`.
- Backend env config in `backend/.env` (copy from `backend/.env.example`).
- Docker compose files are in `docker/`. Production env goes in `docker/.env`.
