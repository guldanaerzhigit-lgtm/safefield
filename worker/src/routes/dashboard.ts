import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import type { AuthVariables } from '../middleware/auth';
import type { Env } from '../types';
const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.use('*', authMiddleware);
app.get('/summary', async (c) => {
  const user = c.get('user');
  let sessionSql = `SELECT COUNT(*) AS n FROM safety_sessions WHERE status='ACTIVE'`;
  let alertSql = `SELECT COUNT(*) AS n FROM safety_alerts WHERE status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')`;
  let checkinSql = `SELECT COUNT(*) AS n FROM safety_checkins WHERE responded_at IS NULL AND due_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')`;
  let employeeSql = `SELECT COUNT(*) AS n FROM users WHERE status='ACTIVE'`;
  if (user.role === 'EMPLOYEE') {
    sessionSql += ' AND employee_id=?'; alertSql += ' AND employee_id=?'; checkinSql += ' AND c.employee_id=?'; employeeSql = `SELECT COUNT(*) AS n FROM users WHERE id=? AND status='ACTIVE'`;
  } else if (user.role === 'SUPERVISOR') {
    sessionSql += ' AND employee_id IN (SELECT id FROM users WHERE department_id=?)'; alertSql += ' AND employee_id IN (SELECT id FROM users WHERE department_id=?)'; checkinSql += ' AND c.employee_id IN (SELECT id FROM users WHERE department_id=?)'; employeeSql += ' AND department_id=?';
  }
  const bind = user.role === 'EMPLOYEE' ? [user.id] : user.role === 'SUPERVISOR' ? [user.departmentId || ''] : [];
  const [sessions,alerts,checkins,employees] = await Promise.all([c.env.DB.prepare(sessionSql).bind(...bind).first<{n:number}>(),c.env.DB.prepare(alertSql).bind(...bind).first<{n:number}>(),c.env.DB.prepare(checkinSql).bind(...bind).first<{n:number}>(),c.env.DB.prepare(employeeSql).bind(...bind).first<{n:number}>()]);
  return c.json({ summary: { activeSessions: sessions?.n ?? 0, openAlerts: alerts?.n ?? 0, overdueCheckins: checkins?.n ?? 0, activeEmployees: employees?.n ?? 0 } });
});
export default app;
