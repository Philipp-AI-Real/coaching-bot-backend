import { vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/guards/roles.guard';

// Build a fake ExecutionContext whose request carries the given user.
const makeContext = (user: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

const makeReflector = (roles: string[] | undefined): Reflector =>
  ({ getAllAndOverride: vi.fn().mockReturnValue(roles) }) as unknown as Reflector;

describe('RolesGuard', () => {
  it('should allow the request when no @Roles() metadata is present', () => {
    const guard = new RolesGuard(makeReflector(undefined));
    const ctx = makeContext({ id: 1, role: 'user', tenantId: 1 });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow the request when @Roles() is an empty list', () => {
    const guard = new RolesGuard(makeReflector([]));
    const ctx = makeContext({ id: 1, role: 'user', tenantId: 1 });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow the request when the user role is in the allowed list', () => {
    const guard = new RolesGuard(makeReflector(['tenant_admin', 'superadmin']));
    const ctx = makeContext({ id: 1, role: 'tenant_admin', tenantId: 1 });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should forbid the request when the user role is not in the allowed list', () => {
    const guard = new RolesGuard(makeReflector(['tenant_admin', 'superadmin']));
    const ctx = makeContext({ id: 1, role: 'user', tenantId: 1 });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should forbid the request when there is no authenticated user', () => {
    const guard = new RolesGuard(makeReflector(['superadmin']));
    const ctx = makeContext(undefined);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
