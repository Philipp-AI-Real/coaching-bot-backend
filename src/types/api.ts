// ─── API Contract – Coaching Bot Backend ─────────────────────────────────────
// This file is the SINGLE SOURCE OF TRUTH for all frontend ↔ backend types.
// Location: src/types/api.ts (backend repo: coaching-bot-backend)
//
// OWNERSHIP RULE:
//   - Only edited in the backend repo (coaching-bot-backend)
//   - Frontend copies this file to its own src/types/api.ts
//   - After every change: update version + date below, notify frontend
//   - Never break existing response shapes without coordinating with frontend
//
// Last updated: 2026-04-14 | Version: 1.3.0
// ─────────────────────────────────────────────────────────────────────────────


// ─── Standard Response Wrapper ───────────────────────────────────────────────
// Every endpoint returns this shape – applied by ResponseInterceptor.
// Error responses (HttpExceptionFilter) use { success: false, message, data: null }.

export interface ApiResponse<T> {
  success: boolean
  message: string
  data: T | null
}


// ─── Auth ─────────────────────────────────────────────────────────────────────
// POST /auth/login
// GET  /auth/me

export interface LoginRequest {
  username: string
  password: string
}

export interface AuthUser {
  id: number
  username: string
  role: 'admin' | 'user'
}

export interface LoginData {
  accessToken: string
  user: AuthUser
}

// POST /auth/login  → ApiResponse<LoginData>
// GET  /auth/me     → ApiResponse<AuthUser>


// ─── Health ───────────────────────────────────────────────────────────────────
// GET /health

export interface HealthData {
  ok: boolean
}

// Example: { "success": true, "message": "Service is healthy", "data": { "ok": true } }


// ─── Chat ─────────────────────────────────────────────────────────────────────
// POST /chat/ask
// GET  /chat/history

export interface ChatAskRequest {
  message: string
}

export interface ChatAskData {
  reply: string
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  createdAt: string       // ISO 8601
}

export interface ChatHistoryData {
  items: ChatMessage[]
  total: number
  page: number
  limit: number
  totalPages: number
}


// ─── Knowledge Base (Documents) ───────────────────────────────────────────────
// POST   /knowledge-base        – upload document (multipart/form-data, field: "file")
// GET    /knowledge-base        – list all documents
// GET    /knowledge-base/:id    – get single document
// DELETE /knowledge-base/:id    – delete document

export interface KnowledgeBaseDocument {
  id: number
  title: string | null
  originalFilename: string
  mimeType: string | null
  relativePath: string
  fileUrl?: string          // only set when FILES_PUBLIC_BASE_URL is configured
  chunkCount: number
  createdAt: string         // ISO 8601
  updatedAt: string         // ISO 8601
}

// POST   /knowledge-base       → ApiResponse<KnowledgeBaseDocument>
// GET    /knowledge-base       → ApiResponse<KnowledgeBaseDocument[]>
// GET    /knowledge-base/:id   → ApiResponse<KnowledgeBaseDocument>
// DELETE /knowledge-base/:id   → ApiResponse<KnowledgeBaseDeleteData>

export interface KnowledgeBaseDeleteData {
  deletedId: number
}


// ─── HTTP Status Codes (frontend error handling reference) ───────────────────
//   200 – OK              GET success
//   201 – Created         POST success
//   400 – Bad request     invalid input (check message)
//   401 – Unauthorized    missing/invalid JWT → redirect to login
//   403 – Forbidden       valid JWT, wrong role → show permission error
//   404 – Not found
//   429 – Too many requests (rate limited)
//   500 – Server error    never exposes stack trace
// ─────────────────────────────────────────────────────────────────────────────


// ─── Changelog ────────────────────────────────────────────────────────────────
// 1.3.0 – 2026-04-14  Phase 2 Auth: added LoginRequest, AuthUser, LoginData
//                     POST /auth/login → ApiResponse<LoginData>
//                     GET  /auth/me    → ApiResponse<AuthUser>
// 1.2.0 – 2026-04-13  Full audit against controllers + services:
//                     - ChatAskRequest: removed non-existent sessionId field
//                     - ChatAskData: field is "reply", not "answer"; removed
//                       non-existent sources[] and sessionId
//                     - ChatHistoryData: "items" not "messages", "limit" not
//                       "pageSize", added missing "totalPages"
//                     - KnowledgeBaseDocument: added optional fileUrl field
//                     - Removed KnowledgeBaseListData (GET returns plain array)
//                     - Removed KnowledgeBaseUploadData (POST returns single doc)
//                     - Added KnowledgeBaseDeleteData for DELETE response
// 1.1.0 – 2026-04-13  Corrected response wrapper: { success, message, data }
//                     Corrected endpoint paths: /chat/ask, /knowledge-base
//                     Aligned id types with Prisma schema (number, not string)
// 1.0.0 – 2026-04-13  Initial version
// ─────────────────────────────────────────────────────────────────────────────
