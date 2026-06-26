import { SetMetadata } from '@nestjs/common';

// Metadata key under which the allowed roles for a route are stored.
export const ROLES_KEY = 'roles';

// Restrict a route to one or more roles. Used together with RolesGuard.
// Example: @Roles('tenant_admin', 'superadmin')
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
