import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import type { Env } from '../types';
import { sendWebPush } from '../utils/webPush';

type AppEnv = { Bindings: Env; Variables: AuthVariables };
const app = new Hono<AppEnv>();
app.use('*', authMiddleware);

const createSchema = z.object({
  activityTypeId: z.string().min(1),
  title: z.string().min(3).max(160),
  siteAddress: z.string().min(3).max(500),
  siteLat: z.number().min(-90).max(90).nullable().optional(),
  siteLng: z.number().min(-180).max(180).nullable().optional(),
  plannedStartAt: z.iso.datetime(),
  plannedEndAt: z.iso.datetime(),
  checkinIntervalMinutes: z.number().int().min(5).max(240).default(30),
  supervisorId: z.string().nullable().optional()
}).refine(v => new Date(v.plannedEndAt) > new Date(v.plannedStartAt), 'Аяқталу уақыты басталу уақытынан кейін болуы керек');

const locationSchema = z.object({ latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional(), accuracy: z.number().min(0).max(10000).nullable().optional() });
const checkinSchema = locationSchema.extend({ response: z.enum(['SAFE', 'NEED_HELP']), clientEventId: z.string().uuid().optional() });

const sosSchema = z.object({
  message: z.string().max(1000).optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  accuracy: z.number().min(0).max(10000).nullable().optional(),
  hidden: z.boolean().default(false),
  clientEventId: z.string().uuid().optional()
});

type SessionRow = { id: string; employee_id: string; status: string; checkin_interval_minutes: number };
type OwnedSessionResult = { session: SessionRow; error: null } | { session: null; error: Response };

async function getOwnedSession(c: Context<AppEnv>, id: string): Promise<OwnedSessionResult> {
  const user = c.get('user');
  const session = await c.env.DB.prepare(
    'SELECT id, employee_id, status, checkin_interval_minutes FROM safety_sessions WHERE id=?'
  ).bind(id).first<{ id: string; employee_id: string; status: string; checkin_interval_minutes: number }>();
  if (!session) return { session: null, error: c.json({ error: { code: 'NOT_FOUND', message: 'Қауіпсіздік сессиясы табылмады' } }, 404) };
  if (session.employee_id !== user.id && user.role !== 'ADMIN') {
    return { session: null, error: c.json({ error: { code: 'FORBIDDEN', message: 'Бұл сессия басқа қызметкерге тиесілі' } }, 403) };
  }
  return { session, error: null };
}

async function enqueueEscalations(c: Context<AppEnv>, alertId: string, firstDelayMinutes: number) {
  const steps = [
    { level: 1, role: 'SUPERVISOR', minutes: firstDelayMinutes },
    { level: 2, role: 'DISPATCHER', minutes: firstDelayMinutes + 5 },
    { level: 3, role: 'SAFETY_MANAGER', minutes: firstDelayMinutes + 10 }
  ] as const;
  for (const step of steps) {
    const dueAt = new Date(Date.now() + step.minutes * 60_000).toISOString();
    await c.env.DB.prepare(
      "INSERT INTO safety_escalations (id,alert_id,level,target_role,status,due_at) VALUES (?,?,?,?,'PENDING',?)"
    ).bind(crypto.randomUUID(), alertId, step.level, step.role, dueAt).run();
  }
}


async function sendImmediateSosPush(c: Context<AppEnv>, alertId: string) {
  const user = c.get('user');
  const supervisorId = user.supervisorId;
  let delivered = 0;
  let failed = 0;
  const now = new Date().toISOString();

  try {
    const recipient = supervisorId
      ? await c.env.DB.prepare("SELECT id FROM users WHERE id=? AND status='ACTIVE'").bind(supervisorId).first<{id:string}>()
      : null;
    if (!recipient) {
      await c.env.DB.prepare("UPDATE safety_escalations SET status='FAILED' WHERE alert_id=? AND level=1 AND status='PENDING'").bind(alertId).run();
      return;
    }

    const subscriptions = await c.env.DB.prepare(
      'SELECT id,user_id,endpoint,p256dh,auth FROM notification_subscriptions WHERE user_id=?'
    ).bind(recipient.id).all<{id:string;user_id:string;endpoint:string;p256dh:string;auth:string}>();

    for (const sub of subscriptions.results) {
      try {
        if (!c.env.VAPID_PRIVATE_KEY || !c.env.VAPID_PUBLIC_KEY || !c.env.VAPID_SUBJECT) {
          throw new Error('VAPID кілттері бапталмаған');
        }
        const status = await sendWebPush(sub, {
          title: 'SAFEFIELD: SOS дабылы',
          body: user.fullName + ' шұғыл көмек сұрады. Дереу хабарласыңыз.',
          url: '/alerts',
          alertId,
          priority: 'CRITICAL'
        }, {
          VAPID_PRIVATE_KEY: c.env.VAPID_PRIVATE_KEY,
          VAPID_PUBLIC_KEY: c.env.VAPID_PUBLIC_KEY,
          VAPID_SUBJECT: c.env.VAPID_SUBJECT
        });
        delivered++;
        await c.env.DB.prepare(
          "INSERT INTO notification_logs(id,user_id,alert_id,channel,template_key,status,provider_message_id,sent_at) VALUES(?,?,?,'PUSH','SOS_IMMEDIATE','SENT',?,?)"
        ).bind(crypto.randomUUID(), recipient.id, alertId, String(status), now).run();
        await c.env.DB.prepare('UPDATE notification_subscriptions SET last_used_at=? WHERE id=?').bind(now, sub.id).run();
      } catch (error) {
        failed++;
        const message = error instanceof Error ? error.message : 'Push жеткізу қатесі';
        if (message.includes('HTTP 404') || message.includes('HTTP 410')) {
          await c.env.DB.prepare('DELETE FROM notification_subscriptions WHERE id=?').bind(sub.id).run();
        }
        await c.env.DB.prepare(
          "INSERT INTO notification_logs(id,user_id,alert_id,channel,template_key,status,error_message) VALUES(?,?,?,'PUSH','SOS_IMMEDIATE','FAILED',?)"
        ).bind(crypto.randomUUID(), recipient.id, alertId, message.slice(0, 500)).run();
      }
    }

    await c.env.DB.prepare(
      "UPDATE safety_escalations SET status=?,sent_at=? WHERE alert_id=? AND level=1 AND status='PENDING'"
    ).bind(delivered > 0 ? 'SENT' : 'FAILED', delivered > 0 ? now : null, alertId).run();
  } catch (error) {
    console.error('sos_immediate_push_failed', alertId, error);
    await c.env.DB.prepare(
      "UPDATE safety_escalations SET status='FAILED' WHERE alert_id=? AND level=1 AND status='PENDING'"
    ).bind(alertId).run();
    failed++;
  }

  console.log(JSON.stringify({event:'sos_immediate_push_attempt',alertId,delivered,failed}));
}

async function evaluateSafetyZones(c: Context<AppEnv>, sessionId: string, latitude: number, longitude: number) {
  const user = c.get('user');
  const zones = await c.env.DB.prepare("SELECT id,name,zone_type AS zoneType,center_lat AS centerLat,center_lng AS centerLng,radius_meters AS radiusMeters FROM safety_zones WHERE is_active=1 AND (department_id IS NULL OR department_id=?)").bind(user.departmentId || '').all<{id:string;name:string;zoneType:string;centerLat:number;centerLng:number;radiusMeters:number}>();
  const radians = (value:number) => value * Math.PI / 180;
  for (const zone of zones.results) {
    if (zone.zoneType === 'SAFE') continue;
    const dLat = radians(zone.centerLat - latitude);
    const dLng = radians(zone.centerLng - longitude);
    const a = Math.sin(dLat/2)**2 + Math.cos(radians(latitude))*Math.cos(radians(zone.centerLat))*Math.sin(dLng/2)**2;
    const distance = 6371000 * 2 * Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    if (distance > zone.radiusMeters) continue;
    const message = zone.zoneType === 'DANGER' ? 'Қызметкер қауіпті аймаққа кірді: ' + zone.name : 'Қызметкер ескерту аймағына кірді: ' + zone.name;
    const existing = await c.env.DB.prepare("SELECT id FROM safety_alerts WHERE session_id=? AND alert_type='RISK_ZONE' AND status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS') AND message=? LIMIT 1").bind(sessionId,message).first();
    if (existing) continue;
    const alertId = crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO safety_alerts(id,session_id,employee_id,alert_type,priority,status,message,latitude,longitude) VALUES(?,?,?,'RISK_ZONE',?,'OPEN',?,?,?)").bind(alertId,sessionId,user.id,zone.zoneType==='DANGER'?'CRITICAL':'HIGH',message,latitude,longitude).run();
    await enqueueEscalations(c,alertId,0);
    await c.env.DB.prepare("INSERT INTO audit_logs(id,actor_user_id,action,resource_type,resource_id,department_id) VALUES(?,?,'SAFETY_ZONE_ALERT_CREATED','SAFETY_ALERT',?,?)").bind(crypto.randomUUID(),user.id,alertId,user.departmentId).run();
  }
}

app.get('/', async c => {
  const user = c.get('user');
  const base = 'SELECT s.*, t.name AS activity_name FROM safety_sessions s JOIN safety_activity_types t ON t.id=s.activity_type_id';
  let stmt;
  if (user.role === 'EMPLOYEE') {
    stmt = c.env.DB.prepare(base + ' WHERE s.employee_id=? ORDER BY s.created_at DESC LIMIT 100').bind(user.id);
  } else if (user.role === 'SUPERVISOR') {
    stmt = c.env.DB.prepare(base + ' JOIN users e ON e.id=s.employee_id WHERE e.supervisor_id=? ORDER BY s.created_at DESC LIMIT 200').bind(user.id);
  } else {
    stmt = c.env.DB.prepare(base + ' ORDER BY s.created_at DESC LIMIT 200');
  }
  const rows = await stmt.all();
  return c.json({ sessions: rows.results });
});

app.post('/', async c => {
  const user = c.get('user');
  if (user.role !== 'EMPLOYEE' && user.role !== 'ADMIN') {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Жұмыс сессиясын тек қызметкер өзі құра алады' } }, 403);
  }
  const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.issues[0]?.message || 'Деректер дұрыс толтырылмаған' } }, 400);
  const value = parsed.data;
  const activity = await c.env.DB.prepare('SELECT id FROM safety_activity_types WHERE id=? AND is_active=1').bind(value.activityTypeId).first();
  if (!activity) return c.json({ error: { code: 'INVALID_ACTIVITY_TYPE', message: 'Қызмет түрі табылмады' } }, 400);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO safety_sessions (id,employee_id,supervisor_id,activity_type_id,title,site_address,site_lat,site_lng,planned_start_at,planned_end_at,checkin_interval_minutes,status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,'PLANNED')`
  ).bind(id, user.id, value.supervisorId || user.supervisorId, value.activityTypeId, value.title, value.siteAddress, value.siteLat ?? null, value.siteLng ?? null, value.plannedStartAt, value.plannedEndAt, value.checkinIntervalMinutes).run();
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id,actor_user_id,action,resource_type,resource_id,department_id) VALUES (?,?,'SESSION_CREATED','SAFETY_SESSION',?,?)`
  ).bind(crypto.randomUUID(), user.id, id, user.departmentId).run();
  return c.json({ id, status: 'PLANNED' }, 201);
});

app.post('/:id/start', async c => {
  const owned = await getOwnedSession(c, c.req.param('id'));
  if (owned.error) return owned.error;
  const session = owned.session;
  if (session.status !== 'PLANNED') return c.json({ error: { code: 'INVALID_STATE', message: 'Тек жоспарланған сессияны бастауға болады' } }, 409);
  const location = locationSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!location.success) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'GPS координаттары дұрыс емес' } }, 400);
  const now = new Date();
  const due = new Date(now.getTime() + session.checkin_interval_minutes * 60_000).toISOString();
  const update = await c.env.DB.prepare(
    `UPDATE safety_sessions SET status='ACTIVE',started_at=?,updated_at=? WHERE id=? AND status='PLANNED'`
  ).bind(now.toISOString(), now.toISOString(), session.id).run();
  if (!update.meta.changes) return c.json({ error: { code: 'INVALID_STATE', message: 'Сессия күйі өзгерді. Бетті жаңартып, қайта көріңіз' } }, 409);
  await c.env.DB.prepare(
    `INSERT INTO safety_checkins (id,session_id,employee_id,due_at) VALUES (?,?,?,?)`
  ).bind(crypto.randomUUID(), session.id, c.get('user').id, due).run();
  if (location.data.latitude != null && location.data.longitude != null) {
    await c.env.DB.prepare(`INSERT INTO safety_locations (id,employee_id,session_id,latitude,longitude,accuracy,recorded_at,source) VALUES (?,?,?,?,?,?,?,'GPS')`).bind(crypto.randomUUID(), c.get('user').id, session.id, location.data.latitude, location.data.longitude, location.data.accuracy ?? null, now.toISOString()).run();
  }
  if (location.data.latitude != null && location.data.longitude != null) await evaluateSafetyZones(c,session.id,location.data.latitude,location.data.longitude);
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id,actor_user_id,action,resource_type,resource_id) VALUES (?,?,'SESSION_STARTED','SAFETY_SESSION',?)`
  ).bind(crypto.randomUUID(), c.get('user').id, session.id).run();
  return c.json({ id: session.id, status: 'ACTIVE', nextCheckinAt: due });
});

app.post('/:id/checkin', async c => {
  const owned = await getOwnedSession(c, c.req.param('id'));
  if (owned.error) return owned.error;
  const session = owned.session!;
  if (session.status !== 'ACTIVE') return c.json({ error: { code: 'INVALID_STATE', message: 'Қауіпсіздікті растау тек белсенді сессия кезінде қолжетімді' } }, 409);
  const parsed = checkinSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Қауіпсіз немесе көмек қажет екенін таңдаңыз және координаттарды дұрыс енгізіңіз' } }, 400);
  const value = parsed.data;
  if (value.clientEventId) { const prior = await c.env.DB.prepare('SELECT response_json FROM offline_event_receipts WHERE client_event_id=? AND user_id=?').bind(value.clientEventId,c.get('user').id).first<{response_json:string}>(); if(prior) return c.json(JSON.parse(prior.response_json)); }
  const now = new Date();
  const nextDue = new Date(now.getTime() + session.checkin_interval_minutes * 60_000).toISOString();
  const answered = await c.env.DB.prepare(
    `UPDATE safety_checkins SET responded_at=?,response=?,latitude=?,longitude=?
     WHERE id=(SELECT id FROM safety_checkins WHERE session_id=? AND employee_id=? AND responded_at IS NULL ORDER BY due_at ASC LIMIT 1)
       AND responded_at IS NULL RETURNING id`
  ).bind(now.toISOString(), value.response, value.latitude ?? null, value.longitude ?? null, session.id, c.get('user').id).first<{ id: string }>();
  if (!answered && !value.clientEventId) return c.json({ error: { code: 'CHECKIN_NOT_SCHEDULED', message: 'Бұл сессияда күтілген растау жоқ' } }, 409);
  if (!answered && value.clientEventId) {
    await c.env.DB.prepare(`INSERT INTO safety_checkins (id,session_id,employee_id,due_at,responded_at,response,latitude,longitude) VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),session.id,c.get('user').id,now.toISOString(),now.toISOString(),value.response,value.latitude??null,value.longitude??null).run();
  }
  await c.env.DB.prepare(
    `INSERT INTO safety_checkins (id,session_id,employee_id,due_at) VALUES (?,?,?,?)`
  ).bind(crypto.randomUUID(), session.id, c.get('user').id, nextDue).run();
  if (value.latitude != null && value.longitude != null) {
    await c.env.DB.prepare(
      `INSERT INTO safety_locations (id,employee_id,session_id,latitude,longitude,accuracy,recorded_at,source) VALUES (?,?,?,?,?,?,?,'GPS')`
    ).bind(crypto.randomUUID(), c.get('user').id, session.id, value.latitude, value.longitude, value.accuracy ?? null, now.toISOString()).run();
  }
  if (value.latitude != null && value.longitude != null) await evaluateSafetyZones(c,session.id,value.latitude,value.longitude);
  if (value.response === 'NEED_HELP') {
    const alertId = crypto.randomUUID();
    await c.env.DB.prepare(
      "INSERT INTO safety_alerts (id,session_id,employee_id,alert_type,priority,status,message,latitude,longitude) VALUES (?,?,?,'MANUAL','HIGH','OPEN','Қызметкер көмек сұрады',?,?)"
    ).bind(alertId, session.id, c.get('user').id, value.latitude ?? null, value.longitude ?? null).run();
    await enqueueEscalations(c, alertId, 2);
  }
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id,actor_user_id,action,resource_type,resource_id,department_id) VALUES (?,?,?,?,?,?)`
  ).bind(crypto.randomUUID(), c.get('user').id, 'SESSION_CHECKIN_' + value.response, 'SAFETY_SESSION', session.id, c.get('user').departmentId).run();
  const result = { ok: true, response: value.response, nextCheckinAt: nextDue };
  if(value.clientEventId) await c.env.DB.prepare('INSERT OR IGNORE INTO offline_event_receipts(client_event_id,user_id,response_json) VALUES(?,?,?)').bind(value.clientEventId,c.get('user').id,JSON.stringify(result)).run();
  return c.json(result);
});

app.post('/:id/sos', async c => {
  const owned = await getOwnedSession(c, c.req.param('id'));
  if (owned.error) return owned.error;
  const session = owned.session!;
  if (!['ACTIVE', 'PLANNED'].includes(session.status)) return c.json({ error: { code: 'INVALID_STATE', message: 'Жабылған сессия үшін SOS жіберу мүмкін емес' } }, 409);
  const parsed = sosSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: { code: 'VALIDATION_ERROR', message: 'SOS деректері дұрыс емес' } }, 400);
  const value = parsed.data;
  if (value.clientEventId) { const prior = await c.env.DB.prepare('SELECT response_json FROM offline_event_receipts WHERE client_event_id=? AND user_id=?').bind(value.clientEventId,c.get('user').id).first<{response_json:string}>(); if(prior) return c.json(JSON.parse(prior.response_json)); }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO safety_alerts (id,session_id,employee_id,alert_type,priority,status,message,latitude,longitude,location_accuracy) VALUES (?,?,?,?,'CRITICAL','OPEN',?,?,?,?)`
  ).bind(id, session.id, c.get('user').id, value.hidden ? 'HIDDEN_SOS' : 'SOS', value.message || (value.hidden ? 'Жасырын шұғыл көмек сигналы' : 'Шұғыл көмек қажет'), value.latitude ?? null, value.longitude ?? null, value.accuracy ?? null).run();
  await enqueueEscalations(c, id, 0);
  await sendImmediateSosPush(c, id);
  if (value.latitude != null && value.longitude != null) {
    await c.env.DB.prepare(
      "INSERT INTO safety_locations (id,employee_id,session_id,latitude,longitude,recorded_at,source) VALUES (?,?,?,?,?,?,'GPS')"
    ).bind(crypto.randomUUID(), c.get('user').id, session.id, value.latitude, value.longitude, new Date().toISOString()).run();
  }
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id,actor_user_id,action,resource_type,resource_id,department_id) VALUES (?,?,'SOS_CREATED','SAFETY_ALERT',?,?)`
  ).bind(crypto.randomUUID(), c.get('user').id, id, c.get('user').departmentId).run();
  const result = { alertId: id, status: 'OPEN', priority: 'CRITICAL' };
  if(value.clientEventId) await c.env.DB.prepare('INSERT OR IGNORE INTO offline_event_receipts(client_event_id,user_id,response_json) VALUES(?,?,?)').bind(value.clientEventId,c.get('user').id,JSON.stringify(result)).run();
  return c.json(result, 201);
});

app.post('/:id/complete', async c => {
  const owned = await getOwnedSession(c, c.req.param('id'));
  if (owned.error) return owned.error;
  const session = owned.session!;
  if (!['ACTIVE', 'PLANNED', 'PAUSED'].includes(session.status)) return c.json({ error: { code: 'INVALID_STATE', message: 'Сессия аяқталған' } }, 409);
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    `UPDATE safety_sessions SET status='COMPLETED',ended_at=?,updated_at=? WHERE id=?`
  ).bind(now, now, session.id).run();
  await c.env.DB.prepare(
    `UPDATE safety_checkins SET responded_at=?,response='SAFE' WHERE session_id=? AND responded_at IS NULL`
  ).bind(now, session.id).run();
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (id,actor_user_id,action,resource_type,resource_id,department_id) VALUES (?,?,'SESSION_COMPLETED','SAFETY_SESSION',?,?)`
  ).bind(crypto.randomUUID(), c.get('user').id, session.id, c.get('user').departmentId).run();
  return c.json({ id: session.id, status: 'COMPLETED' });
});

export default app;
