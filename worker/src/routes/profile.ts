import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.use('*', authMiddleware);

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).nullable().optional(),
  emergencyContactName: z.string().trim().max(120).nullable().optional(),
  emergencyContactPhone: z.string().trim().max(40).nullable().optional(),
});

app.get('/', async c => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(`
    SELECT u.id,u.email,u.full_name AS fullName,u.phone,u.locale,u.status,
      r.code AS role,r.name AS roleName,u.department_id AS departmentId,
      d.name AS departmentName,u.supervisor_id AS supervisorId,
      s.full_name AS supervisorName,p.avatar_url AS avatarUrl,
      p.emergency_contact_name AS emergencyContactName,
      p.emergency_contact_phone AS emergencyContactPhone,
      p.safety_briefing_status AS safetyBriefingStatus,
      p.safety_briefing_at AS safetyBriefingAt
    FROM users u JOIN roles r ON r.id=u.role_id
    LEFT JOIN departments d ON d.id=u.department_id
    LEFT JOIN users s ON s.id=u.supervisor_id
    LEFT JOIN user_profiles p ON p.user_id=u.id
    WHERE u.id=? LIMIT 1
  `).bind(user.id).first<Record<string, string | null>>();
  if (!row) return c.json({ error: { code: 'NOT_FOUND', message: 'Профиль табылмады' } }, 404);
  return c.json({ profile: row });
});

app.patch('/', async c => {
  const user = c.get('user');
  const parsed = profileSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Профиль мәліметтерін дұрыс толтырыңыз' } }, 400);
  const d = parsed.data;
  await c.env.DB.prepare(`
    UPDATE users SET full_name=?,phone=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?
  `).bind(d.fullName, d.phone?.trim() || null, user.id).run();
  await c.env.DB.prepare(`
    INSERT INTO user_profiles(user_id,emergency_contact_name,emergency_contact_phone)
    VALUES(?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      emergency_contact_name=excluded.emergency_contact_name,
      emergency_contact_phone=excluded.emergency_contact_phone,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).bind(user.id, d.emergencyContactName?.trim() || null, d.emergencyContactPhone?.trim() || null).run();
  await c.env.DB.prepare(`
    INSERT INTO audit_logs(id,actor_user_id,action,resource_type,resource_id,department_id)
    VALUES(?,?,'PROFILE_UPDATED','USER',?,?)
  `).bind(crypto.randomUUID(), user.id, user.id, user.departmentId).run();
  return c.json({ ok: true });
});

export default app;
