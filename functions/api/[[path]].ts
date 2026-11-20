import app from '../../worker/src/index';
import type { Env } from '../../worker/src/types';

export async function onRequest(context: { request: Request; env: Env }) {
  return app.fetch(context.request, context.env);
}
