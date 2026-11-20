import { createMiddleware } from 'hono/factory';
import { jwtVerify } from 'jose';
import type { AuthUser, Env } from '../types';
type Variables = { user: AuthUser };
export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: Variables }>(async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header?.startsWith('Bearer ')) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
  try {
    const secret = c.env.JWT_SECRET;
    if (!secret || secret.length < 32) return c.json({ error: { code: 'AUTH_NOT_CONFIGURED', message: 'Authentication is not configured' } }, 503);
    const { payload } = await jwtVerify(header.slice(7), new TextEncoder().encode(secret), { issuer: 'safefield', audience: 'safefield-api' });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string' || typeof payload.role !== 'string') throw new Error('Invalid token claims');
    c.set('user', { id: payload.sub, email: payload.email, fullName: String(payload.name || ''), role: payload.role as AuthUser['role'], roleId: String(payload.roleId || ''), departmentId: typeof payload.departmentId === 'string' ? payload.departmentId : null, supervisorId: typeof payload.supervisorId === 'string' ? payload.supervisorId : null });
    await next();
  } catch { return c.json({ error: { code: 'INVALID_TOKEN', message: 'Session expired or invalid' } }, 401); }
});
export type AuthVariables = Variables;
