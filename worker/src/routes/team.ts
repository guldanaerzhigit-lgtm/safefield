import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.use('*', authMiddleware);

app.get('/', async c => {
  const user = c.get('user');
  if (!['SUPERVISOR','ADMIN'].includes(user.role)) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Бұл бөлімге қол жеткізуге рұқсат жоқ' } }, 403);
  }
  const rows = user.role === 'ADMIN'
    ? await c.env.DB.prepare(`SELECT u.id,u.full_name AS fullName,u.email,u.phone,u.status,r.code AS role,u.department_id AS departmentId,d.name AS departmentName,u.supervisor_id AS supervisorId,s.full_name AS supervisorName FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN departments d ON d.id=u.department_id LEFT JOIN users s ON s.id=u.supervisor_id WHERE r.code IN ('EMPLOYEE','SUPERVISOR') ORDER BY d.name,u.full_name`).all()
    : await c.env.DB.prepare(`SELECT u.id,u.full_name AS fullName,u.email,u.phone,u.status,r.code AS role,u.department_id AS departmentId,d.name AS departmentName,u.supervisor_id AS supervisorId,s.full_name AS supervisorName FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN departments d ON d.id=u.department_id LEFT JOIN users s ON s.id=u.supervisor_id WHERE u.department_id=? AND (u.supervisor_id=? OR (u.supervisor_id IS NULL AND r.code='EMPLOYEE') OR u.id=?) ORDER BY CASE WHEN u.id=? THEN 0 ELSE 1 END,u.full_name`).bind(user.departmentId || '',user.id,user.id,user.id).all();
  return c.json({ members: rows.results, currentSupervisorId: user.id });
});

const assignmentSchema = z.object({ supervisorId: z.string().nullable() });
app.patch('/:id/assignment', async c => {
  const actor = c.get('user');
  if (!['SUPERVISOR','ADMIN'].includes(actor.role)) return c.json({ error: { code: 'FORBIDDEN', message: 'Топ құрамын өзгертуге рұқсат жоқ' } }, 403);
  const parsed = assignmentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Топ жетекшісін дұрыс таңдаңыз' } }, 400);
  const targetId = c.req.param('id');
  const target = await c.env.DB.prepare(`SELECT u.id,u.department_id AS departmentId,r.code AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?`).bind(targetId).first<{id:string;departmentId:string|null;role:string}>();
  if (!target || target.role !== 'EMPLOYEE') return c.json({ error: { code: 'NOT_FOUND', message: 'Қызметкер табылмады' } }, 404);
  if (actor.role === 'SUPERVISOR' && target.departmentId !== actor.departmentId) return c.json({ error: { code: 'FORBIDDEN', message: 'Өз бөлімшеңіздегі қызметкерлерді ғана тағайындай аласыз' } }, 403);
  const supervisorId = parsed.data.supervisorId;
  if (supervisorId) {
    const supervisor = await c.env.DB.prepare(`SELECT u.id,u.department_id AS departmentId,r.code AS role,u.status FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?`).bind(supervisorId).first<{id:string;departmentId:string|null;role:string;status:string}>();
    if (!supervisor || supervisor.role !== 'SUPERVISOR' || supervisor.status !== 'ACTIVE') return c.json({ error: { code: 'INVALID_SUPERVISOR', message: 'Белсенді топ жетекшісі табылмады' } }, 400);
    if (supervisor.departmentId !== target.departmentId) return c.json({ error: { code: 'DEPARTMENT_MISMATCH', message: 'Қызметкер мен топ жетекшісі бір бөлімшеде болуы керек' } }, 400);
    if (actor.role === 'SUPERVISOR' && supervisor.id !== actor.id) return c.json({ error: { code: 'FORBIDDEN', message: 'Қызметкерді тек өз тобыңызға тағайындай аласыз' } }, 403);
  }
  await c.env.DB.prepare(`UPDATE users SET supervisor_id=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(supervisorId,targetId).run();
  await c.env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,resource_type,resource_id,department_id,metadata_json) VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),actor.id,supervisorId?'TEAM_MEMBER_ASSIGNED':'TEAM_MEMBER_UNASSIGNED','USER',targetId,target.departmentId,JSON.stringify({supervisorId})).run();
  return c.json({ ok: true, supervisorId });
});

export default app;
