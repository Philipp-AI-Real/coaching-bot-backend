-- Privacy hotfix: chat messages are now owned by a user (private per-user history).
-- Pilot stage: existing chat history has no owner to backfill, so it is discarded.
DELETE FROM "chat_messages";

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "userId" INTEGER NOT NULL;

-- CreateIndex
CREATE INDEX "chat_messages_userId_idx" ON "chat_messages"("userId");

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
