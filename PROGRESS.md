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

- [ ] User model: `id`, `username`, `passwordHash`, `role` (admin | user), `createdAt`
- [ ] `POST /auth/login` – bcrypt compare, issue JWT (min 64-char secret)
- [ ] `GET /auth/me` – validate Bearer token, return user
- [ ] `JwtAuthGuard` – NestJS guard, validates Bearer token on all protected routes
- [ ] `RolesGuard` – admin-only route protection
- [ ] Rate limiting on `/auth/login`
- [ ] Admin endpoints: `GET/POST/DELETE /admin/users`
- [ ] Update `src/types/api.ts` with User type + auth response types
- [ ] Notify frontend of api.ts changes
