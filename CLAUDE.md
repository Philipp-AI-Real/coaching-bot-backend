backend · MDKopierenCLAUDE.md – Backend (API + Database)

This file is the project briefing for Claude Code.
Claude Code reads this file automatically on startup.
Companion file: CLAUDE.md in coaching-bot-frontend repo (frontend consumes this API)

0) Project Overview
Project Type
[x] C: API for Full Application
      → REST API for authenticated user app
      → Role-based access control (Admin, User)
      → Complex AI/RAG business logic
      → Focus: scalability, security, data consistency
Selected Type: C
Vision & Goal
Project Name: Coaching Bot Pilot – Backend
Client: Philipp (internal)
Goal: NestJS REST API powering an AI coaching assistant. Implements a RAG pipeline (Embed → Retrieve → Generate) using Google Gemini and Qdrant. Manages users, chat history, and document knowledge base. Single source of truth for all data and business logic.
Frontend Repo: github.com/Philipp-AI-Real/coaching-bot-frontend
API Base URL (dev): http://localhost:3000
API Base URL (prod): https://coaching-api.dividendenquelle.de
Timeline: MVP as fast as possible (iterative)
Requirements
API Endpoints:
🔴 POST   /auth/login              – authenticate user (username + password), return JWT
🔴 GET    /auth/me                 – return current user from JWT
🔴 POST   /chat                    – send message, return RAG answer
🔴 GET    /chat/history            – paginated chat history for current user
🔴 POST   /knowledge/upload        – upload document (PDF / TXT / JSON), chunk + embed
🔴 GET    /knowledge               – list all uploaded documents
🔴 DELETE /knowledge/:id           – delete document + remove vectors from Qdrant
🟡 GET    /health                  – health check, returns { status: 'ok' }
🟡 GET    /admin/users             – list all users (admin only)
🟡 POST   /admin/users             – create user (admin only)
🟡 DELETE /admin/users/:id         – delete user (admin only)
🟢 GET    /admin/knowledge/stats   – Qdrant vector count + index stats (admin only)
System / Technical:
🔴 HTTPS only, German servers (Hetzner)
🔴 JWT validation on ALL protected endpoints (every /chat and /knowledge request)
🔴 Passwords stored as bcrypt hash (min 12 rounds) – never plaintext
🔴 CORS locked to frontend domain only (coaching.dividendenquelle.de)
🔴 RAG pipeline: Embed → Retrieve (Qdrant cosine similarity) → Generate (Gemini)
🔴 Document chunking: ~800 chars, 100 overlap
🔴 Embeddings: gemini-embedding-2-preview, 768 dimensions
🟡 Input validation on all POST/PATCH endpoints
🟡 Rate limiting on auth endpoints
🟡 No stack traces in production error responses
🟡 ENV variable validation on startup
🟢 Streaming responses (SSE) for chat – future feature
🟢 API versioning (/api/v1/...) – evaluate when needed
Architecture & Coding Principles
Stack:
Framework:        NestJS + TypeScript (EXISTING codebase – do not rewrite)
AI Orchestration: Built into NestJS modules (RAG pipeline)
Chat Model:       Google Gemini gemini-2.5-flash
Embeddings:       Google Gemini gemini-embedding-2-preview (768 dims)
Vector Database:  Qdrant (Docker, port 6333 – internal only)
Relational DB:    PostgreSQL 16 via Prisma ORM
Secret Mgmt:      .env file (local) / environment variables (production)
IMPORTANT – Existing Codebase:
This is NOT a greenfield project. The NestJS backend already exists.
GitHub: github.com/Philipp-AI-Real/coaching-bot-backend
Local path: C:\Users\agent\Documents\Github_LiveConnection\coaching-bot-backend

Before making any changes:
  1. Read the existing module structure under src/
  2. Understand which endpoints already exist
  3. Never break existing functionality
  4. Extend, don't replace
API Design:
- REST API, JSON only
- No /api prefix (NestJS default routing)
- Auth: Bearer token via Authorization header
- CORS: allow coaching.dividendenquelle.de only (and localhost:3007 in dev)
- Consistent response format: { data, error, message }
Coding Rules (binding for Claude Code):
- Code comments in English
- Commit messages in English, no special characters
- TypeScript strict mode
- No magic numbers – use constants
- Error handling: try-catch on every async handler
- API responses: ALWAYS { data, error, message } format
- Input validation on all incoming data
- Date format in DB: ISO 8601
- Passwords: bcrypt, min 12 rounds
- Secrets: always via env variables, never hardcoded
- No console.log in production (use NestJS Logger)
API Contract

The backend OWNS and DEFINES the API contract.
Location in this repo: src/types/api.ts ← source of truth
The frontend copies this file and must be notified of every change.

OWNERSHIP RULE:
  - src/types/api.ts is ONLY edited in this repo
  - Every change must be documented in PROGRESS.md
  - After every change: notify frontend to sync their copy
  - Never break existing response shapes without coordination

STANDARD RESPONSE FORMAT:
  Success:  { data: T,    error: null,         message: "ok" }
  Error:    { data: null, error: "description", message: "error" }

HTTP STATUS CODES:
  200 – OK (GET success)
  201 – Created (POST success)
  400 – Bad request (invalid input)
  401 – Unauthorized (missing or invalid JWT)
  403 – Forbidden (valid JWT but wrong role)
  404 – Not found
  429 – Too many requests (rate limited)
  500 – Internal server error (never expose stack trace)

CORE TYPES (src/types/api.ts):
  export interface ApiResponse<T> {
    data: T | null
    error: string | null
    message: string
  }

  export interface User {
    id: string
    username: string
    role: "admin" | "user"
    createdAt: string  // ISO 8601
  }

  export interface ChatMessage {
    id: string
    role: "user" | "assistant"
    content: string
    sources: string[]
    createdAt: string  // ISO 8601
  }

  export interface Document {
    id: string
    filename: string
    fileType: "pdf" | "txt" | "json"
    chunkCount: number
    uploadedAt: string  // ISO 8601
  }

  export interface ChatRequest {
    message: string
    sessionId?: string
  }

  export interface ChatResponse {
    answer: string
    sources: string[]
    sessionId: string
  }
Implementation Plan

Status: ✅ Done | 🚀 Current focus | ⏳ Planned | ❌ Cancelled

Phase 1: Get backend running locally 🚀
  [x] Docker Desktop running
  [x] coaching-postgres container (port 5433:5432)
  [x] coaching-qdrant container (port 6333:6333)
  [ ] .env created (GEMINI_API_KEY filled in, DATABASE_URL using port 5433)
  [ ] npm install completed
  [ ] npx prisma migrate deploy completed
  [ ] npm run start:dev – API responds on localhost:3000
  [ ] GET /health returns { status: 'ok' }
  [ ] POST /chat returns a RAG answer (first end-to-end test)
  [ ] POST /auth/login endpoint exists and returns JWT

Phase 2: Auth & User Management ⏳
  [ ] User model in Prisma schema (id, username, passwordHash, role, createdAt)
  [ ] POST /auth/login – bcrypt compare, return JWT
  [ ] GET /auth/me – validate JWT, return user
  [ ] Auth guard (NestJS Guard) – validates Bearer token on all protected routes
  [ ] Role guard – admin-only routes (NestJS RolesGuard)
  [ ] Rate limiting on /auth/login
  [ ] Admin endpoints: GET/POST/DELETE /admin/users
  [ ] src/types/api.ts created with all base types
  [ ] Frontend notified of api.ts

Phase 3: Core API Hardening ⏳
  [ ] Input validation on all POST endpoints
  [ ] CORS locked to coaching.dividendenquelle.de + localhost:3007
  [ ] No stack traces in production responses
  [ ] ENV variable validation on startup (fail fast if GEMINI_API_KEY missing)
  [ ] GET /knowledge/stats endpoint (Qdrant vector count)
  [ ] Consistent { data, error, message } on ALL responses including errors

Phase 4: Docker & Deployment ⏳
  [ ] Dockerfile (multi-stage: build → production)
  [ ] docker-compose.yml:
        app: port 3006:3000
        db: port 127.0.0.1:5436:5432
        qdrant: internal only (no host port)
  [ ] .dockerignore
  [ ] deploy.sh created
  [ ] Local Docker test: docker compose up -d --build
  [ ] GitHub Action: .github/workflows/deploy.yml
  [ ] SSH to server: /opt/coaching-bot-backend/
  [ ] NPM: coaching-api.dividendenquelle.de → coaching-bot-backend-app:3000
  [ ] SSL via Let's Encrypt (NPM)
  [ ] PORTS.md: port 3006 / 5436 confirmed

Phase 5: Go-Live ⏳
  [ ] Seed: create initial admin user
  [ ] Load real documents into Qdrant
  [ ] Verify all endpoints work against production frontend
  [ ] /health used for uptime monitoring
  [ ] DB backup schedule confirmed
Open Items
[ ] 2026-04-13 Confirm exact existing NestJS module/endpoint structure (read src/ first)
[ ] 2026-04-13 Verify POST /auth/login already exists or needs to be built
[ ] 2026-04-13 Confirm Prisma schema has users table with role field
[ ] 2026-04-13 JWT secret: define JWT_SECRET in .env (min 64 random chars)
Project Knowledge (Context Memory)
→ See PROGRESS.md for complete project knowledge and decision log.
Key decisions already made:
2026-04-13  Local port 5432 in use → dev PostgreSQL on port 5433
2026-04-13  coaching-postgres: 5433:5432 (local), 5436:5432 (server)
2026-04-13  coaching-qdrant: 6333:6333 (local), internal only on server
2026-04-13  Gemini Pro account – no free tier limits
2026-04-13  Auth: username + password → bcrypt (min 12 rounds) → JWT
2026-04-13  Server port: 3006 (App), 5436 (DB) – per PORTS.md April 2026
2026-04-13  Domain: coaching-api.dividendenquelle.de
2026-04-13  DB + Qdrant live in this (backend) repo's docker-compose only
2026-04-13  Frontend repo is separate: coaching-bot-frontend
Instructions for Claude Code
ROLE:
  Senior Backend Engineer with expertise in NestJS, TypeScript,
  PostgreSQL, Prisma, Qdrant, Google Gemini API, and REST API design.
  You build secure, well-validated APIs that are the single source
  of truth for all data and AI business logic.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SESSION START (automatic, on every startup)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. Read CLAUDE.md completely
  2. Read PROGRESS.md (if it exists)
  3. Read src/ folder structure to understand existing modules
  4. Check open items above
  5. Output brief status summary:
     "📋 Status: [Phase X – what's running], next: [Task]"
     "⚠️  Open items: [count]"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXISTING CODEBASE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - ALWAYS read existing modules before adding new code
  - NEVER rewrite working functionality
  - EXTEND existing NestJS modules, don't create parallel ones
  - If an endpoint already exists: verify it matches the API contract
    before moving on

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BEFORE CODING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. Check implementation plan – what is the current focus?
  2. Read affected module(s) in src/ first
  3. For complex features: present plan, wait for confirmation
  4. When in doubt: ASK, don't guess

AFTER CODING:
  1. Check off completed tasks in implementation plan
  2. Update PROGRESS.md
  3. Update src/types/api.ts if response shapes changed
  4. Notify: "⚠️ api.ts changed – frontend must sync"
  5. Run self-audit

SELF-AUDIT (required after every phase):
  - try/catch around all async operations?
  - No hanging requests (timeouts set)?
  - Null checks on all external API responses (Gemini, Qdrant)?
  - User input validated before hitting Prisma or Qdrant?
  - ENV variables checked on startup?
  - CORS configured for frontend URL only?
  - JWT validated on all protected endpoints?
  - No Prisma error messages exposed directly to client?

ERROR HANDLING (non-negotiable):
  - Every handler: try/catch wrapping the entire body
  - HTTP codes: 400 / 401 / 403 / 404 / 429 / 500
  - Never expose stack traces in production
  - Missing GEMINI_API_KEY → clear startup error, not silent crash
  - Qdrant unreachable → { data: null, error: "Knowledge base unavailable" }

CODE QUALITY:
  - Comments in English
  - No console.log – use NestJS Logger
  - No 'any' types without justification
  - No magic numbers – constants
  - { data, error, message } on EVERY response

AUTONOMY:
  - Work independently on clear tasks
  - Only ask back for: architecture decisions, security topics,
    breaking changes to existing modules
  - List assumptions at end of each task

REQUIRED REFERENCES:
  - PORTS.md: Backend port 3006, DB port 5436
  - Server: 46.224.191.125
  - NPM container name: coaching-bot-backend-app, internal port 3000
  - API domain: coaching-api.dividendenquelle.de
  - Frontend domain (for CORS): coaching.dividendenquelle.de

B) Tech Stack Reference
Local Dev Setup
[x] Docker Desktop running
[x] coaching-postgres container (port 5433:5432)
[x] coaching-qdrant container (port 6333:6333)
[ ] .env created (see required fields below)
[ ] npm install
[ ] npx prisma migrate deploy
[ ] npm run start:dev → API on localhost:3000
Restart containers after system reboot:
powershelldocker start coaching-postgres coaching-qdrant
.env Required Fields
bash# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/coaching_bot_pilot?schema=public"

# App
PORT=3000
FILES_PUBLIC_BASE_URL="http://localhost:3000"

# Auth
JWT_SECRET="[min-64-random-characters]"
JWT_EXPIRES_IN="7d"

# Gemini
GEMINI_API_KEY="your-key-here"
GEMINI_CHAT_MODEL="gemini-2.5-flash"
GEMINI_CHAT_TEMPERATURE="0.7"
GEMINI_CHAT_MAX_OUTPUT_TOKENS="2048"

# RAG
RAG_TOP_K="8"
RAG_CONTEXT_MAX_CHARS="24000"

# Qdrant
QDRANT_HOST="localhost"
QDRANT_PORT="6333"
QDRANT_API_KEY=""
QDRANT_USE_TLS="false"
QDRANT_COLLECTION="coaching_bot_pilot_knowledge"
QDRANT_VECTOR_SIZE="768"

# Chunking
CHUNK_SIZE="800"
CHUNK_OVERLAP="100"

# Production only
NODE_ENV=production
FRONTEND_URL=https://coaching.dividendenquelle.de
POSTGRES_USER=postgres
POSTGRES_PASSWORD=[min-32-characters]
POSTGRES_DB=coaching_bot_pilot
Docker-Compose (server deployment)
yamlservices:
  app:
    container_name: coaching-bot-backend-app
    build: .
    ports:
      - "3006:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@db:5432/coaching_bot_pilot
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - JWT_SECRET=${JWT_SECRET}
      - FRONTEND_URL=https://coaching.dividendenquelle.de
      - QDRANT_HOST=qdrant
      - QDRANT_PORT=6333
    depends_on: [db, qdrant]
    networks: [default, proxy-network]

  db:
    container_name: coaching-bot-backend-db
    image: postgres:16
    ports:
      - "127.0.0.1:5436:5432"
    environment:
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=coaching_bot_backend
    volumes:
      - postgres_data:/var/lib/postgresql/data

  qdrant:
    container_name: coaching-bot-backend-qdrant
    image: qdrant/qdrant
    # No host port – internal network only
    volumes:
      - qdrant_data:/qdrant/storage

volumes:
  postgres_data:
  qdrant_data:

networks:
  proxy-network:
    external: true
Database Access (DBeaver)
LOCAL:
  Host:     localhost
  Port:     5433
  Database: coaching_bot_pilot
  User:     postgres
  Password: postgres

PRODUCTION (Hetzner):
  Step 1: SSH tunnel (keep terminal open):
    ssh -i ~/.ssh/id_ed25519 -L 5436:localhost:5436 root@46.224.191.125
  Step 2: DBeaver:
    Host: localhost | Port: 5436
    Database: coaching_bot_pilot
    Password: cat /opt/coaching-bot-backend/.env | grep POSTGRES_PASSWORD
Quick Reference
bash# SSH:
ssh root@46.224.191.125

# Deploy manually:
bash /opt/coaching-bot-backend/deploy.sh

# Status:
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Migrations on server:
docker exec coaching-bot-backend-app npx prisma migrate deploy

# NPM admin:
ssh -L 8181:localhost:81 root@46.224.191.125 → http://localhost:8181

C) Progress Tracking (PROGRESS.md)
PROGRESS.md lives in the project root, maintained by Claude Code.

Write after: every completed phase, important decisions, api.ts changes, bug fixes.

─────────────────────────────────────────
# PROGRESS – Coaching Bot Pilot Backend

## Phase [N]: [Name] – [Date] [Status]

### Built
- [endpoint/module] – [what it does]

### DB Schema Changes
- [DATE] [what changed] – migration: [name]

### API Contract Changes (api.ts)
- [DATE] [what changed] – frontend notified: yes/no

### Installed Packages
- [package] – [purpose]

### Decisions & Findings
- [DATE] [decision and reasoning]

### Bugs & Fixes
- [bug] → [fix]

### Open TODOs for Next Phase
- [ ] [task]
─────────────────────────────────────────

D) Feature Checklist

Rule: [ ] = UNDECIDED = ask user | ✅ = Implement | ❌ = Skip | ⏳ = Later
Claude Code NEVER marks features ✅ without explicit user confirmation.

1. Authentication & Access Control
✅ Username + password login (bcrypt)
❌ OAuth / social login
✅ JWT tokens
✅ Role system (admin, user)
❌ Password reset via email
✅ Rate limiting on auth endpoints
⏳ Audit log
2. Core API Endpoints
✅ POST /chat (RAG answer)
✅ GET  /chat/history (paginated)
✅ POST /knowledge/upload (PDF/TXT/JSON)
✅ GET  /knowledge (list documents)
✅ DELETE /knowledge/:id
⏳ Search / filter on knowledge
⏳ CRUD /admin/users
3. Data & Storage
✅ PostgreSQL + Prisma schema
✅ DB migrations
⏳ Seed data (initial admin user)
❌ Hetzner Object Storage
✅ Qdrant for vector/semantic search
4. AI Integration
✅ Google Gemini API (chat + embeddings)
✅ RAG pipeline (Qdrant retrieval)
✅ Document chunking (800 chars, 100 overlap)
⏳ Token usage tracking
⏳ Cost control / rate limiting per user
🟢 Streaming responses (SSE) – future
❌ AI privacy anonymization (low risk for internal use)
5. Security
✅ Input validation on all POST endpoints
✅ CORS locked to frontend domain
✅ Rate limiting (auth endpoints)
⏳ Helmet.js / security headers
✅ No stack traces in production
✅ ENV validation on startup
6. Deployment & DevOps
⏳ Dockerfile (multi-stage)
⏳ docker-compose.yml (app + db + qdrant)
⏳ deploy.sh
⏳ .dockerignore
⏳ GitHub Actions CI/CD
⏳ SSL via NPM (Let's Encrypt)
⏳ Automatic DB backups (cron)
⏳ Monitoring (uptime /health)
✅ PORTS.md updated (3006 / 5436)

E) Deployment & Server Setup
Quick Reference
bashssh root@46.224.191.125
bash /opt/coaching-bot-backend/deploy.sh
bash /opt/coaching-bot-backend/deploy.sh --no-cache
Deployment Checklist
[ ] docker compose up -d --build tested LOCALLY – all green
[ ] .env on server: /opt/coaching-bot-backend/.env
[ ] SSH verified: ssh root@46.224.191.125
[ ] Repo cloned: /opt/coaching-bot-backend/
[ ] deploy.sh created + chmod +x
[ ] docker network ls | grep proxy-network (create if missing)
[ ] bash /opt/coaching-bot-backend/deploy.sh (first manual deploy)
[ ] NPM: coaching-bot-backend-app:3000 → coaching-api.dividendenquelle.de
[ ] SSL Let's Encrypt via NPM
[ ] PORTS.md: port 3006 / 5436 confirmed
[ ] GitHub Secrets: HETZNER_HOST + HETZNER_SSH_KEY
[ ] deploy.yml pushed → auto-deploy tested

F) Lessons Learned
NestJS Specifics

Read existing module structure before adding anything – NestJS is opinionated
Guards go on controllers or individual routes, not globally (unless auth guard)
Use NestJS Logger, never console.log
Prisma client should be a singleton NestJS service (PrismaService)
Qdrant client: initialize once in a dedicated QdrantService

Development Workflow

Always test Docker builds LOCALLY before deploying to server
After Prisma schema changes: restart dev server (Ctrl+C → npm run start:dev)
Commit after each working feature, not after 3 days of work

Git & GitHub

.env must be in .gitignore — NEVER commit passwords
.gitattributes: *.sh text eol=lf → prevents CRLF issues on Windows

Prisma & Database

prisma migrate deploy is production-safe (no reset)
DB credentials in DATABASE_URL and POSTGRES_PASSWORD must match exactly
Run prisma migrate deploy as part of deploy.sh

Security

Rate limit auth endpoints from day one
bcrypt min 12 rounds
JWT secret min 64 random characters
CORS must list frontend URL explicitly – never wildcard * in production
Never expose Prisma or Qdrant error messages directly to client

Docker & Deployment

Port only in ONE place: docker-compose.yml
DB port with 127.0.0.1: prefix → never publicly accessible
Qdrant: no host port in production → internal network only
Run prisma migrate deploy in deploy.sh

Common Bugs

"Port already in use" → docker ps, consult PORTS.md
"Authentication failed (DB)" → DATABASE_URL password ≠ POSTGRES_PASSWORD
"CORS error in frontend" → FRONTEND_URL in .env doesn't match exactly
"Qdrant connection refused" → container not running or wrong QDRANT_HOST
localhost unreachable → Tailscale/VPN active → disconnect