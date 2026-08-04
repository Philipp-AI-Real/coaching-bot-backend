// Roles an admin (tenant_admin or superadmin) may ASSIGN via /admin/users.
// "superadmin" is intentionally excluded — superadmin provisioning stays
// seed-only and is never grantable through this endpoint.
export const ASSIGNABLE_ROLES = ['user', 'tenant_admin'] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

// Supported UI languages (mirrors UserProfile.defaultLanguage).
export const SUPPORTED_LANGUAGES = ['en', 'de'] as const;

// Fields the user list can be sorted by.
export const USER_SORT_BY = ['username', 'role', 'createdAt'] as const;

export type UserSortBy = (typeof USER_SORT_BY)[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;

// Field length / value limits.
export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 50;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

// Pagination defaults / bounds.
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

// bcrypt cost factor — matches the cost used elsewhere in auth ($2b$12).
export const BCRYPT_SALT_ROUNDS = 12;
