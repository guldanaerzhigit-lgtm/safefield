import type { ErrorHandler } from 'hono';
import type { Env } from '../types';
export const errorHandler: ErrorHandler<{ Bindings: Env }> = (error, c) => {
  console.error(JSON.stringify({ level: 'error', message: error.message, path: c.req.path, method: c.req.method }));
  return c.json({ error: { code: 'INTERNAL_ERROR', message: c.env.APP_ENV === 'production' ? 'Серверде күтпеген қате орын алды' : error.message } }, 500);
};
