import { createMiddleware } from 'hono/factory';
import type { AuthVariables } from './auth';
import type { Env, Role } from '../types';
export const requireRoles = (...roles: Role[]) => createMiddleware<{ Bindings: Env; Variables: AuthVariables }>(async (c, next) => {
  const user = c.get('user');
  if (!roles.includes(user.role)) return c.json({ error: { code: 'FORBIDDEN', message: 'Insufficient role permissions' } }, 403);
  await next();
});
