import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.use('*', authMiddleware);

const categories = ['UNSAFE_CONDITION','NEAR_MISS','INJURY','EQUIPMENT','ENVIRONMENT','OTHER'] as const;
const statuses = ['ACKNOWLEDGED','IN_PROGRESS','RESOLVED','REJECTED'] as const;
const canManage = (role: string) => ['SUPERVISOR','DISPATCHER','SAFETY_MANAGER','ADMIN'].includes(role);

app.get('/', async c => {
  const u = c.get('user');
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') || 50)));
  const where = u.role === 'EMPLOYEE' ? 'WHERE i.reported_by=?'
    : u.role === 'SUPERVISOR' ? 'WHERE (i.department_id=? OR r.supervisor_id=?)'
    : u.role === 'ADMIN' || u.role === 'SAFETY_MANAGER' || u.role === 'DISPATCHER' ? '' : 'WHERE i.reported_by=?';
  const bind = u.role === 'EMPLOYEE' ? [u.id, limit] : u.role === 'SUPERVISOR' ? [u.departmentId || '', u.id, limit] : [limit];
  const sql = `SELECT i.id,i.category,i.severity,i.title,i.description,i.status,i.latitude,i.longitude,
    i.location_accuracy AS locationAccuracy,i.evidence_name AS evidenceName,i.created_at AS createdAt,
    i.updated_at AS updatedAt,i.resolved_at AS resolvedAt,
    reporter.full_name AS reporterName,assignee.full_name AS assigneeName
    FROM safety_incidents i JOIN users reporter ON reporter.id=i.reported_by
    LEFT JOIN users assignee ON assignee.id=i.assigned_to
    LEFT JOIN users r ON r.id=i.reported_by ${where}
    ORDER BY CASE i.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,i.created_at DESC LIMIT ?`;
  const rows = await c.env.DB.prepare(sql).bind(...bind).all();
  return c.json({ incidents: rows.results });
});

app.post('/', async c => {
  const u = c.get('user');
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: { code: 'INVALID_FORM', message: 'Оқиға деректерін жіберіңіз' } }, 400);
  const parsed = z.object({
    category: z.enum(categories),
    severity: z.enum(['LOW','MEDIUM','HIGH','CRITICAL']).default('MEDIUM'),
    title: z.string().trim().min(4).max(140),
    description: z.string().trim().min(10).max(4000),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    accuracy: z.coerce.number().min(0).max(10000).optional()
  }).safeParse({
    category: form.get('category'), severity: form.get('severity') || 'MEDIUM',
    title: form.get('title'), description: form.get('description'),
    latitude: form.get('latitude') || undefined, longitude: form.get('longitude') || undefined,
    accuracy: form.get('accuracy') || undefined
  });
  if (!parsed.success) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Міндетті өрістерді дұрыс толтырыңыз (атауы кемінде 4, сипаттамасы кемінде 10 таңба)' } }, 400);
  const d = parsed.data;
  if ((d.latitude === undefined) !== (d.longitude === undefined)) return c.json({ error: { code: 'INVALID_LOCATION', message: 'GPS координаттарының екеуін де жіберіңіз' } }, 400);
  const photo = form.get('photo');
  let evidenceKey: string | null = null, evidenceName: string | null = null, evidenceType: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > 6 * 1024 * 1024) return c.json({ error: { code: 'FILE_TOO_LARGE', message: 'Фото көлемі 6 МБ-тан аспауы керек' } }, 400);
    if (!['image/jpeg','image/png','image/webp'].includes(photo.type)) return c.json({ error: { code: 'INVALID_FILE', message: 'JPG, PNG немесе WEBP фотосын таңдаңыз' } }, 400);
    if (!c.env.EVIDENCE_BUCKET) return c.json({ error: { code: 'STORAGE_UNAVAILABLE', message: 'Фото сақтау қоймасы бапталмаған' } }, 503);
    evidenceKey = `incidents/${u.departmentId || 'general'}/${crypto.randomUUID()}`;
    evidenceName = photo.name.slice(0,180); evidenceType = photo.type;
    await c.env.EVIDENCE_BUCKET.put(evidenceKey, await photo.arrayBuffer(), { httpMetadata: { contentType: photo.type }, customMetadata: { uploadedBy: u.id } });
  }
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(`INSERT INTO safety_incidents(id,reported_by,department_id,category,severity,title,description,latitude,longitude,location_accuracy,evidence_key,evidence_name,evidence_type)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,u.id,u.departmentId,d.category,d.severity,d.title,d.description,d.latitude ?? null,d.longitude ?? null,d.accuracy ?? null,evidenceKey,evidenceName,evidenceType).run();
    await c.env.DB.prepare('INSERT INTO safety_incident_history(id,incident_id,actor_id,action,to_status,note) VALUES(?,?,?,\'CREATED\',\'NEW\',?)').bind(crypto.randomUUID(),id,u.id,'Оқиға тіркелді').run();
    await c.env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,action,resource_type,resource_id,department_id,metadata_json) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),u.id,'INCIDENT_CREATED','SAFETY_INCIDENT',id,u.departmentId,JSON.stringify({category:d.category,severity:d.severity,hasEvidence:!!evidenceKey})).run();
  } catch (error) {
    if (evidenceKey && c.env.EVIDENCE_BUCKET?.delete) await c.env.EVIDENCE_BUCKET.delete(evidenceKey);
    throw error;
  }
  return c.json({ ok: true, id }, 201);
});

app.get('/:id/evidence', async c => {
  const u = c.get('user'), id = c.req.param('id');
  const item = await c.env.DB.prepare('SELECT reported_by,department_id,evidence_key,evidence_type,evidence_name FROM safety_incidents WHERE id=?').bind(id).first<{reported_by:string;department_id:string|null;evidence_key:string|null;evidence_type:string|null;evidence_name:string|null}>();
  if (!item) return c.json({ error: { code: 'NOT_FOUND', message: 'Оқиға табылмады' } }, 404);
  if (u.role === 'EMPLOYEE' && item.reported_by !== u.id) return c.json({ error: { code: 'FORBIDDEN', message: 'Рұқсат жоқ' } }, 403);
  if (u.role === 'SUPERVISOR' && item.department_id !== u.departmentId) return c.json({ error: { code: 'FORBIDDEN', message: 'Рұқсат жоқ' } }, 403);
  if (!item.evidence_key || !c.env.EVIDENCE_BUCKET) return c.json({ error: { code: 'NOT_FOUND', message: 'Фото тіркелмеген' } }, 404);
  const object = await c.env.EVIDENCE_BUCKET.get(item.evidence_key);
  if (!object) return c.json({ error: { code: 'NOT_FOUND', message: 'Фото табылмады' } }, 404);
  c.header('Content-Type', item.evidence_type || 'application/octet-stream');
  c.header('Cache-Control', 'private, no-store');
  c.header('Content-Disposition', 'inline; filename="evidence"');
  return new Response(object.body);
});

app.get('/:id/history', async c => {
  const u = c.get('user'), id = c.req.param('id');
  const incident = await c.env.DB.prepare('SELECT reported_by,department_id FROM safety_incidents WHERE id=?').bind(id).first<{reported_by:string;department_id:string|null}>();
  if (!incident) return c.json({ error: { code: 'NOT_FOUND', message: 'Оқиға табылмады' } }, 404);
  if (u.role === 'EMPLOYEE' && incident.reported_by !== u.id) return c.json({ error: { code: 'FORBIDDEN', message: 'Рұқсат жоқ' } }, 403);
  if (u.role === 'SUPERVISOR' && incident.department_id !== u.departmentId) return c.json({ error: { code: 'FORBIDDEN', message: 'Рұқсат жоқ' } }, 403);
  const rows = await c.env.DB.prepare('SELECT h.action,h.note,h.from_status AS fromStatus,h.to_status AS toStatus,h.created_at AS createdAt,u.full_name AS actorName FROM safety_incident_history h LEFT JOIN users u ON u.id=h.actor_id WHERE h.incident_id=? ORDER BY h.created_at').bind(id).all();
  return c.json({ history: rows.results });
});

app.patch('/:id', async c => {
  const u = c.get('user');
  if (!canManage(u.role)) return c.json({ error: { code: 'FORBIDDEN', message: 'Оқиғаны өңдеуге рұқсат жоқ' } }, 403);
  const id = c.req.param('id');
  const parsed = z.object({ status: z.enum(statuses), note: z.string().trim().min(3).max(1000), assignedTo: z.string().min(1).optional() }).safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Күй мен түсіндірмені толтырыңыз' } }, 400);
  const current = await c.env.DB.prepare('SELECT id,status,department_id FROM safety_incidents WHERE id=?').bind(id).first<{id:string;status:string;department_id:string|null}>();
  if (!current) return c.json({ error: { code: 'NOT_FOUND', message: 'Оқиға табылмады' } }, 404);
  if (u.role === 'SUPERVISOR' && current.department_id !== u.departmentId) return c.json({ error: { code: 'FORBIDDEN', message: 'Бұл оқиға сіздің бөлімге жатпайды' } }, 403);
  if (current.status === 'RESOLVED' || current.status === 'REJECTED') return c.json({ error: { code: 'INVALID_STATE', message: 'Жабылған оқиғаны қайта өзгертуге болмайды' } }, 409);
  const d = parsed.data;
  if (d.assignedTo) {
    const assignee = await c.env.DB.prepare("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.status='ACTIVE' AND r.code IN ('SUPERVISOR','DISPATCHER','SAFETY_MANAGER','ADMIN')").bind(d.assignedTo).first();
    if (!assignee) return c.json({ error: { code: 'INVALID_ASSIGNEE', message: 'Жауапты маман табылмады' } }, 400);
  }
  await c.env.DB.prepare("UPDATE safety_incidents SET status=?,assigned_to=COALESCE(?,assigned_to),resolved_at=CASE WHEN ? IN ('RESOLVED','REJECTED') THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(d.status,d.assignedTo || null,d.status,id).run();
  await c.env.DB.prepare('INSERT INTO safety_incident_history(id,incident_id,actor_id,action,note,from_status,to_status) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,u.id,'STATUS_CHANGED',d.note,current.status,d.status).run();
  await c.env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,action,resource_type,resource_id,department_id,metadata_json) VALUES(?,?,?,?,?,?,?)').bind(crypto.randomUUID(),u.id,'INCIDENT_STATUS_CHANGED','SAFETY_INCIDENT',id,current.department_id,JSON.stringify({from:current.status,to:d.status})).run();
  return c.json({ ok: true, status: d.status });
});

export default app;
