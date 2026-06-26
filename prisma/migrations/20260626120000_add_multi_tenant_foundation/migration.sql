-- Multi-Tenant Foundation (Phase 1).
-- Converts the single-tenant schema to multi-tenant with full data isolation.
-- Pilot stage: existing chat history and knowledge base documents are discarded.
-- Order is chosen so no constraint is ever violated on the populated "users" table:
-- create tenants -> seed default -> add nullable tenantId -> backfill -> set NOT NULL
-- -> swap unique index -> add foreign keys.

-- 1. Tenants table
CREATE TABLE "tenants" (
    "id"           SERIAL NOT NULL,
    "slug"         TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "logoUrl"      TEXT,
    "primaryColor" TEXT,
    "features"     JSONB NOT NULL DEFAULT '{}',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- 2. Seed the default tenant so existing users can be backfilled
INSERT INTO "tenants" ("slug", "name", "features", "updatedAt")
VALUES ('default', 'Default Tenant', '{}', CURRENT_TIMESTAMP);

-- 3. Clean slate (pilot): discard pre-tenant knowledge base + chat data
DELETE FROM "chat_messages";
DELETE FROM "knowledge_base_documents";

-- 4. Add tenantId as NULLABLE first (existing user rows must not violate NOT NULL)
ALTER TABLE "users"                    ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "knowledge_base_documents" ADD COLUMN "tenantId" INTEGER;
ALTER TABLE "chat_messages"            ADD COLUMN "tenantId" INTEGER;

-- 5. Backfill existing users to the default tenant (KB + chat are empty after step 3)
UPDATE "users"
SET "tenantId" = (SELECT "id" FROM "tenants" WHERE "slug" = 'default')
WHERE "tenantId" IS NULL;

-- 6. Promote the existing admin user to superadmin
UPDATE "users" SET "role" = 'superadmin' WHERE "role" = 'admin';

-- 7. Enforce NOT NULL now that every row has a tenantId
ALTER TABLE "users"                    ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "knowledge_base_documents" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "chat_messages"            ALTER COLUMN "tenantId" SET NOT NULL;

-- 8. Swap unique constraint: username is now unique per tenant, not globally
DROP INDEX "users_username_key";
CREATE UNIQUE INDEX "users_tenantId_username_key" ON "users"("tenantId", "username");

-- 9. Tenant lookup indexes
CREATE INDEX "users_tenantId_idx"                     ON "users"("tenantId");
CREATE INDEX "knowledge_base_documents_tenantId_idx"  ON "knowledge_base_documents"("tenantId");
CREATE INDEX "chat_messages_tenantId_idx"             ON "chat_messages"("tenantId");

-- 10. Foreign keys
ALTER TABLE "users"
    ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "knowledge_base_documents"
    ADD CONSTRAINT "knowledge_base_documents_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chat_messages"
    ADD CONSTRAINT "chat_messages_tenantId_fkey" FOREIGN KEY ("tenantId")
    REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
