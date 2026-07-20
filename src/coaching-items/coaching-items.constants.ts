// Allowed status values for a coaching item.
// `type` is intentionally an open string (no enum) so new item types need no migration.
export const COACHING_ITEM_STATUSES = [
  'open',
  'in_progress',
  'completed',
  'paused',
] as const;

export type CoachingItemStatus = (typeof COACHING_ITEM_STATUSES)[number];

// Who created the item.
export const COACHING_ITEM_CREATED_BY = [
  'user',
  'coach_ai',
  'tenant_admin',
] as const;

export type CoachingItemCreatedBy = (typeof COACHING_ITEM_CREATED_BY)[number];

// Statuses considered "active" — injected into the chat system prompt.
export const ACTIVE_STATUSES: CoachingItemStatus[] = ['open', 'in_progress'];

// Max open items injected into the chat system prompt (context budget).
export const MAX_PROMPT_ITEMS = 10;

// Field length limits.
export const MAX_TYPE_LENGTH = 60;
export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 5000;
