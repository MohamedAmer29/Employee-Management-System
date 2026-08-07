import { Reflector } from '@nestjs/core';
import { RolesGuard } from './role.guard';
import type { ExecutionContext } from '@nestjs/common';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should allow access when no roles are required', () => {
    const context = {
      getHandler: jest.fn().mockReturnValue(() => undefined),
      switchToHttp: jest.fn().mockReturnValue({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;

    jest.spyOn(reflector, 'get').mockReturnValue(undefined);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access when user role matches required role', () => {
    const context = {
      getHandler: jest.fn().mockReturnValue(() => undefined),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({ user: { role: 'Admin' } }),
      }),
    } as unknown as ExecutionContext;

    jest.spyOn(reflector, 'get').mockReturnValue(['Admin']);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny access when user role does not match required roles', () => {
    const context = {
      getHandler: jest.fn().mockReturnValue(() => undefined),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({ user: { role: 'Employee' } }),
      }),
    } as unknown as ExecutionContext;

    jest.spyOn(reflector, 'get').mockReturnValue(['Admin', 'Manager']);

    expect(guard.canActivate(context)).toBe(false);
  });
});
