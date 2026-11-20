import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.use('*', authMiddleware);

app.get('/overview', async c => {
  const user = c.get('user');
  if (!['DISPATCHER','SAFETY_MANAGER','ADMIN','SUPERVISOR'].includes(user.role)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Бұл бөлімге қол жеткізуге рұқсат жоқ' } }, 403);
  }
  const supervisorFilter = user.role === 'SUPERVISOR';
  const sessionSql = `SELECT s.id,s.title,s.site_address AS siteAddress,s.status,s.started_at AS startedAt,s.planned_end_at AS plannedEndAt,s.checkin_interval_minutes AS checkinIntervalMinutes,e.id AS employeeId,e.full_name AS employeeName,e.phone,d.name AS departmentName,(SELECT l.latitude FROM safety_locations l WHERE l.session_id=s.id ORDER BY l.recorded_at DESC LIMIT 1) AS latitude,(SELECT l.longitude FROM safety_locations l WHERE l.session_id=s.id ORDER BY l.recorded_at DESC LIMIT 1) AS longitude,(SELECT l.recorded_at FROM safety_locations l WHERE l.session_id=s.id ORDER BY l.recorded_at DESC LIMIT 1) AS locationRecordedAt,(SELECT MIN(ci.due_at) FROM safety_checkins ci WHERE ci.session_id=s.id AND ci.responded_at IS NULL) AS nextCheckinDueAt FROM safety_sessions s JOIN users e ON e.id=s.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE s.status='ACTIVE' ${supervisorFilter ? 'AND e.supervisor_id=?' : ''} ORDER BY s.started_at DESC LIMIT 250`;
  const alertSql = `SELECT a.id,a.alert_type AS alertType,a.priority,a.status,a.message,a.latitude,a.longitude,a.created_at AS createdAt,e.full_name AS employeeName,e.phone,d.name AS departmentName FROM safety_alerts a JOIN users e ON e.id=a.employee_id LEFT JOIN departments d ON d.id=e.department_id WHERE a.status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS') ${supervisorFilter ? 'AND e.supervisor_id=?' : ''} ORDER BY CASE a.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 ELSE 2 END,a.created_at DESC LIMIT 250`;
  const bind = supervisorFilter ? [user.id] : [];
  const [sessions, alerts] = await Promise.all([
    c.env.DB.prepare(sessionSql).bind(...bind).all(),
    c.env.DB.prepare(alertSql).bind(...bind).all()
  ]);
  return c.json({ sessions: sessions.results, alerts: alerts.results, generatedAt: new Date().toISOString() });
});

export default app;
