# PROGRESS – Coaching Bot Pilot Backend

---

## Phase 1: Get Backend Running Locally – 2026-04-13 ✅

### Built

- `GET /health` – liveness check, returns `{ ok: true }` wrapped in standard `ApiResponse`
- `POST /knowledge-base` – multipart upload (.txt / .json / .pdf); chunks text, embeds via Gemini, stores in Postgres + Qdrant
- `GET /knowledge-base` – list all documents (Postgres metadata)
- `GET /knowledge-base/:id` – get single document by id
- `DELETE /knowledge-base/:id` – delete document, local file, and all Qdrant points
- `POST /chat/ask` – RAG pipeline: embed query → retrieve from Qdrant → generate Gemini reply; persists user + assistant messages
- `GET /chat/history` – paginated chat history (newest first), returns `{ items, total, page, limit, totalPages }`
- `GET /api` – Swagger UI served in development

**Modules:**
- `AppModule` – root, global ConfigModule, wires all feature modules
- `PrismaModule` – singleton `PrismaService` (global, re-exported)
- `QdrantModule` – `QdrantService` initialises Qdrant collection on startup
- `EmbeddingModule` – `GeminiEmbeddingService` (768-dim, `gemini-embedding-2-preview`)
- `KnowledgeBaseModule` – upload / list / get / delete pipeline
- `ChatModule` – `ChatService` (RAG ask), `GeminiChatService` (generation)
- `common/` – `ResponseInterceptor` (wraps all responses), `HttpExceptionFilter` (normalises errors), `ResponseMessage` decorator

### DB Schema Changes

- `2026-04-13` Initial migration `20250324120000_init` applied via `prisma migrate dev`
  - Table `chat_messages` (id, role, content, createdAt)
  - Table `knowledge_base_documents` (id, title, originalFilename, mimeType, relativePath, chunkCount, createdAt, updatedAt)

### API Contract Changes (api.ts)

- `2026-04-13 v1.0.0` – initial version created
- `2026-04-13 v1.1.0` – corrected response wrapper to `{ success, message, data }`, aligned id types to `number`, corrected endpoint paths
- `2026-04-13 v1.2.0` – full controller/service audit:
  - `ChatAskRequest`: removed non-existent `sessionId` field
  - `ChatAskData`: field is `reply` not `answer`; removed `sources[]` and `sessionId`
  - `ChatHistoryData`: `items` not `messages`; `limit` not `pageSize`; added `totalPages`
  - `KnowledgeBaseDocument`: added optional `fileUrl`
  - Removed `KnowledgeBaseListData` (GET returns plain array)
  - Removed `KnowledgeBaseUploadData` (POST returns single flat doc)
  - Added `KnowledgeBaseDeleteData { deletedId: number }`
  - **Frontend must sync api.ts: no**

### Installed Packages

**Runtime:**
- `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` `^11` – NestJS framework
- `@nestjs/config` `^4` – env/config management (ConfigModule)
- `@nestjs/swagger` `^11` – Swagger/OpenAPI UI at `/api`
- `@prisma/client` `^6.5` – Prisma ORM client (PostgreSQL)
- `@qdrant/js-client-rest` `^1.16` – Qdrant vector DB client
- `@google/genai` `^1.46` – Google Gemini SDK (embeddings + chat)
- `class-validator` `^0.14` – DTO validation decorators
- `class-transformer` `^0.5` – DTO transformation (query param coercion)
- `pdf-parse` `^1.1` – PDF text extraction
- `rxjs` `^7.8` – NestJS observables (interceptors)
- `reflect-metadata` `^0.2` – required for NestJS decorators

**Dev:**
- `prisma` `^6.5` – CLI for migrations, schema management
- `@nestjs/testing` `^11` – NestJS test utilities (`Test.createTestingModule`)
- `ts-jest` `^29` – TypeScript Jest transform
- `jest` `^30` – test runner
- `@types/jest`, `@types/multer`, `@types/pdf-parse` – type definitions
- `supertest` `^7` – HTTP integration test helper

### Decisions & Findings

- `2026-04-13` **Port conflict**: local port 5432 in use by system PostgreSQL → dev container runs on 5433
- `2026-04-13` **Gemini model**: `gemini-2.5-flash` for chat (fast, cost-effective); `gemini-embedding-2-preview` for 768-dim embeddings; both via `@google/genai` SDK
- `2026-04-13` **Response wrapper**: `{ success: boolean, message: string, data: T | null }` — applied globally by `ResponseInterceptor`; errors via `HttpExceptionFilter` (same shape, `success: false`)
- `2026-04-13` **File storage**: files stored locally under `storage/knowledge-base/` with UUID-prefixed filenames; served as static assets at `/storage/`; `FILES_PUBLIC_BASE_URL` env var controls the public URL prefix
- `2026-04-13` **Qdrant collection**: auto-created at startup via `QdrantService.onModuleInit`; name configurable via `QDRANT_COLLECTION` env var
- `2026-04-13` **Chunking**: 800-char chunks with 100-char overlap; configurable via `CHUNK_SIZE` / `CHUNK_OVERLAP` env vars

### Bugs & Fixes

- `2026-04-13` **POST /knowledge-base → 500 Internal Server Error** (root cause: Prisma migrations not applied; `knowledge_base_documents` table did not exist)
  → Fix: ran `npx prisma migrate dev`; migration `20250324120000_init` applied successfully

- `2026-04-13` **HttpExceptionFilter silently swallowed non-HttpException errors** (500s returned "Internal server error" with no log; impossible to diagnose)
  → Fix: added `private readonly logger = new Logger(HttpExceptionFilter.name)` and `this.logger.error(method + url, exception.stack)` for all status >= 500

- `2026-04-13` **Prisma binaryTargets missing "windows"** (backend originally generated on Mac darwin-arm64; Windows query engine not bundled)
  → Fix: added `binaryTargets = ["native", "windows"]` to `generator client` block in `schema.prisma`

- `2026-04-13` **`prisma migrate deploy` insufficient for first local setup** (`migrate deploy` only applies existing migrations; `migrate dev` is required to create missing migrations from schema diff)
  → Fix: added `prisma migrate dev` step to Phase 1 local setup checklist in CLAUDE.md

### Open TODOs for Next Phase (Phase 2)

- [x] User model: `id`, `username`, `passwordHash`, `role` (admin | user), `createdAt`
- [x] `POST /auth/login` – bcrypt compare, issue JWT (min 64-char secret)
- [x] `GET /auth/me` – validate Bearer token, return user
- [x] `JwtAuthGuard` – NestJS guard, validates Bearer token on all protected routes
- [ ] `RolesGuard` – admin-only route protection _(not yet needed)_
- [ ] Rate limiting on `/auth/login` _(not yet needed)_
- [ ] Admin endpoints: `GET/POST/DELETE /admin/users` _(deferred)_
- [x] Update `src/types/api.ts` with User type + auth response types
- [x] Notify frontend of api.ts changes

---

## Phase 2: Auth & User Management – 2026-04-14 ✅

### Built

- `POST /auth/login` – bcrypt compare (12 rounds), issues JWT signed with `JWT_SECRET`; constant-time failure branch to prevent username enumeration
- `GET /auth/me` – returns `{ id, username, role }` for the JWT subject
- `JwtAuthGuard` + `JwtStrategy` (Passport) – protects `/chat/*` and `/knowledge-base/*`
- `@CurrentUser()` param decorator – injects authenticated user into controller methods
- Frontend CORS opened for `http://localhost:3007` and `https://coaching.dividendenquelle.de` (plus `FRONTEND_URL` env override)

### DB Schema Changes

- `2026-04-14` Migration `20260414090611_add_users_table` – table `users` (id, username unique, passwordHash, role default "user", createdAt)

### API Contract Changes (api.ts)

- `2026-04-14 v1.3.0` – added `LoginRequest`, `AuthUser`, `LoginData`
- `2026-04-14 v1.4.0` – `AuthUser.role` widened from `'admin' | 'user'` to `string` to match actual service response
- **Frontend must sync api.ts: yes**

### Installed Packages

- `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt` – JWT auth pipeline
- `bcrypt` + `@types/bcrypt` – password hashing

---

## Phase 2.5: Speech Module – 2026-04-14 ✅

### Built

- `POST /speech/transcribe` – multipart `audio` field, routes to OpenAI Whisper
- `POST /speech/synthesize` – JSON `{ text, language }`, streams `audio/mpeg` from ElevenLabs
- Both endpoints are unauthenticated by design (called directly from the browser alongside `/chat/ask`)

### Decisions & Findings

- `2026-04-14` Speech stays outside the standard `ApiResponse` wrapper on `/speech/synthesize` (returns a raw audio stream)
- `2026-04-14` ElevenLabs voice IDs split by language via `ELEVENLABS_VOICE_ID_EN` / `ELEVENLABS_VOICE_ID_DE`

### API Contract Changes (api.ts)

- `2026-04-14 v1.5.0` – added `TranscribeData`, `SynthesizeRequest`, `SupportedLanguage` alias; `ChatAskRequest.language?: 'en'|'de'` added
- **Frontend must sync api.ts: yes**

---

## Phase 3: AI Provider Migration – Gemini → OpenAI – 2026-04-16 / 2026-04-17 ✅

### Built

- `OpenAIChatService` – wraps OpenAI chat completions; owns retry loop (3 attempts, 2s/4s backoff) on 429 / 503 / `rate_limit` / `overloaded` / `unavailable`; surfaces a user-friendly "AI coach is currently busy" 503 after exhaustion
- `EmbeddingService` – OpenAI `text-embedding-3-small` (1536 dims); `embedText` / `embedQuery` (bidirectional, delegates) / `embedTexts` (batch, default batch size 100)
- `ChatService` refactored: builds system prompt + context block locally, passes `(systemPrompt, userMessage)` to OpenAI; retry logic moved into the OpenAI service; dropped inline retry loop
- `QdrantService` – default vector size 1536; on startup, if existing collection has a different dim, logs a warning, deletes it, and recreates with correct dims (auto-migration for the 768 → 1536 jump)
- Defensive dim check in `KnowledgeBaseService.ingestIntoQdrant` – throws before calling Qdrant if embedding and collection dims don't match (replaces opaque Qdrant 400)
- Startup warning in `main.ts`: `⚠️  Embeddings changed to OpenAI. Re-upload all documents.`
- `scripts/test-gemini.mjs` – standalone Gemini connectivity probe (still useful for other Google SDK work); used to diagnose the free-tier quota wall that triggered this migration

### Deleted

- `src/chat/gemini-chat.service.ts`, `src/embedding/gemini-embedding.service.ts` – replaced entirely
- `@google/genai` uninstalled from `package.json`

### API Contract Changes (api.ts)

- `2026-04-16 v1.6.0` – added `BatchUploadData`, `BatchUploadSucceededItem`, `BatchUploadFailedItem` for new batch endpoint (see Phase 3.5)
- `2026-04-16 v1.7.0` – chat backend Gemini → OpenAI (documentation-only; `/chat/ask` response shape unchanged)
- `2026-04-16 v1.8.0` – embeddings Gemini → OpenAI; `QDRANT_VECTOR_SIZE` is now 1536; collection auto-recreates; **all previously ingested documents must be re-uploaded**
- **Frontend must sync api.ts: yes** (v1.8.0 bump; no code changes required on frontend — shapes unchanged)

### Installed Packages

- `openai` – OpenAI SDK (chat + embeddings + whisper)

### Decisions & Findings

- `2026-04-16` **Free-tier quota wall**: the Gemini API key in use returned `429 RESOURCE_EXHAUSTED` (`limit: 0` daily requests) for `gemini-2.0-flash` despite user having a Pro account. Root cause: API key tied to a different/unbilled Google Cloud project. Rather than reprovision, migrated the whole stack to OpenAI (chat was swapped first, embeddings followed once we confirmed it worked).
- `2026-04-16` **OpenAI embeddings are bidirectional** — unlike Gemini's `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY` task types, `text-embedding-3-small` uses the same call for both ingestion and query. `embedQuery` now just delegates to `embedText`.
- `2026-04-16` **Qdrant auto-migration** — chose to detect dim mismatch on startup and recreate the collection automatically rather than require a manual reset script. Trades off data loss for zero-touch upgrade; acceptable because re-uploading documents is cheap.
- `2026-04-17` **OpenAI config env split**: `OPENAI_CHAT_MODEL` (default `gpt-4o-mini`) and `OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-small`) — both configurable so we can upgrade independently.

### Bugs & Fixes

- `2026-04-16` **Qdrant 400 Bad Request on every upsert after the embeddings migration** – traced to a duplicate `QDRANT_VECTOR_SIZE` entry in user's local `.env` (line 14: `"1536"`, line 25: `"768"` — dotenv last-wins rule applied the stale value). Live collection got recreated at 768, then OpenAI's 1536-dim vectors were rejected.
  → Fix: deleted the duplicate line in `.env`; added startup log `Qdrant config loaded — vectorSize=N (from QDRANT_VECTOR_SIZE)` and an explicit pre-upsert dim check with a clear error message so this class of issue is actionable from logs.

---

## Phase 3.5: Knowledge Base Batch Upload + Frontend 503 UX – 2026-04-16 ✅

### Built

- `POST /knowledge-base/batch` – multipart field `files` (array), max 20 files / 20 MB each, sequential processing, partial-success response `{ uploaded[], failed[], total, succeeded, failed_count }` (never aborts on first failure). Full Swagger decorators.
- Frontend `ChatWindow.tsx` + `lib/api.ts` – 503 responses no longer redirect to login. `apiCall` returns `message: 'SERVICE_UNAVAILABLE'` for 503; the chat component shows a toast ("Coach is busy right now. Please try again."), restores the user's message to the input, and rolls back the orphan user bubble so they can resend cleanly.

### API Contract Changes (api.ts)

- `2026-04-16 v1.6.0` – see Phase 3 entry

---

## Phase 4: User Profile Fields – 2026-04-17 ✅

### Built

- `GET /auth/profile` – returns full profile (id, username, role, avatarUrl, logoUrl, defaultLanguage, soundEnabled)
- `PATCH /auth/profile` – updates `defaultLanguage` and/or `soundEnabled` (validated via `class-validator` `@IsIn(['en','de'])` / `@IsBoolean`); requires at least one field
- `POST /auth/profile/avatar` – multipart field `avatar`, 5 MB limit, mime allowlist `image/{jpeg,png,webp}`; saved to `storage/avatars/{userId}-avatar.{ext}`
- `POST /auth/profile/logo` – multipart field `logo`, 5 MB limit, mime allowlist `image/{jpeg,png,webp,svg+xml}`; saved to `storage/logos/{userId}-logo.{ext}`
- All protected by `JwtAuthGuard`; all return the fully-updated profile
- Upload flow deletes any prior file for the same user *before* writing (prevents orphans when the extension changes, e.g. replacing a `.jpg` with a `.webp`); rolls back the written file if the DB update fails
- Prisma `P2025` is mapped to `NotFoundException` (clean 404 instead of leaking the Prisma error)

### DB Schema Changes

- `2026-04-17` Migration `20260417103512_add_user_profile_fields` – added `avatarUrl String?`, `logoUrl String?`, `defaultLanguage String @default("en")`, `soundEnabled Boolean @default(true)` to `users` table

### API Contract Changes (api.ts)

- `2026-04-17 v1.9.0` – added `UserProfile`, `UpdateProfileRequest`, `ProfileAvatarResponse`. `AuthUser` (minimal id/username/role) is unchanged — `POST /auth/login` and `GET /auth/me` still return the minimal shape; profile endpoints return `UserProfile`.
- **Frontend must sync api.ts: yes**

### Decisions & Findings

- `2026-04-17` **Path stored, URL computed**: `avatarUrl` / `logoUrl` in DB hold the relative storage path (e.g. `storage/avatars/1-avatar.png`). Matches the existing `KnowledgeBaseDocument.relativePath` pattern. Frontend prepends `NEXT_PUBLIC_API_URL` (or we can add an optional `fileUrl` field later if the pattern grows).
- `2026-04-17` **Filename pattern `{userId}-{kind}.{ext}`** – stable per-user, one file per kind, predictable cleanup. Prior files with a different extension are pruned via `fs.readdir` + prefix match before writing.

### Bugs & Fixes

- `2026-04-17` **Windows `prisma generate` failed with `EPERM`** on the query-engine DLL rename after the migration (dev server holding the old DLL open). Types regenerated fine in `.prisma/client/index.d.ts`; only the DLL swap was blocked. Workaround: stop the dev server once post-migration, re-run `npx prisma generate`.

---

## Test Coverage Summary (as of 2026-04-17)

- **69 tests across 8 files**, all passing under Vitest:
  - `auth.service.spec.ts` (18) – login, getProfile, updateProfile, uploadAvatar, uploadLogo
  - `chat.service.spec.ts` (9) – ask, getHistory, RAG pipeline failures
  - `chat.controller.spec.ts` – route wiring
  - `embedding.service.spec.ts` (8) – 1536-dim output, trim, empty rejection, batch, vectorSize getter
  - `knowledge-base.service.spec.ts` – createFromUpload (incl. explicit 1536-dim upsert assertion), findAll, findOne, remove, dim-mismatch rejection
  - `knowledge-base.controller.spec.ts` – route wiring
  - `qdrant.service.spec.ts` (5) – collection creation, env override, dim-mismatch recreate, expectedVectorSize

---

## Open TODOs for Future Phases

- [ ] `RolesGuard` – admin-only route protection (pre-req for admin endpoints)
- [ ] Admin endpoints: `GET/POST/DELETE /admin/users`
- [ ] Rate limiting on `/auth/login` (`@nestjs/throttler`)
- [ ] Helmet.js / security headers
- [ ] `GET /knowledge/stats` – Qdrant vector count + index stats (admin only)
- [ ] Seed: create initial admin user
- [ ] Phase 5: Dockerfile + docker-compose + deploy.sh + GitHub Actions deploy
- [ ] Backup schedule for PostgreSQL
- [ ] Uptime monitoring against `/health`
