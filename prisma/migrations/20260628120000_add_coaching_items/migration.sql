-- Coaching Items (Phase 2).
-- Generic, type-agnostic coaching items (goals, habits, commitments, ...).
-- Strict isolation: every item belongs to exactly one user AND one tenant.

CREATE TABLE "coaching_items" (
    "id"          SERIAL NOT NULL,
    "tenantId"    INTEGER NOT NULL,
    "userId"      INTEGER NOT NULL,
    "type"        TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "status"      TEXT NOT NULL DEFAULT 'open',
    "dueDate"     TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata"    JSONB NOT NULL DEFAULT '{}',
    "createdBy"   TEXT NOT NULL DEFAULT 'user',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "coaching_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "coaching_items_tenantId_idx"                  ON "coaching_items"("tenantId");
CREATE INDEX "coaching_items_userId_idx"                    ON "coaching_items"("userId");
CREATE INDEX "coaching_items_userId_tenantId_status_idx"    ON "coaching_items"("userId", "tenantId", "status");

ALTER TABLE "coaching_items"
    ADD CONSTRAINT "coaching_items_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coaching_items"
    ADD CONSTRAINT "coaching_items_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
