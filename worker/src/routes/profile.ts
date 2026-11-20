import { Hono } from 'hono';
import { z } from 'zod';
import { compare } from 'bcryptjs';
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


const passwordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(12).max(128),
});
async function verifyCurrentPassword(password: string, stored: string): Promise<boolean> {
  if (/^\\$2[aby]\\$/.test(stored)) return compare(password, stored);
  if (!stored.startsWith('pbkdf2
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


app.post('/password', async c => {
  const user=c.get('user');
  const parsed=passwordSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:{code:'VALIDATION_ERROR',message:'Ағымдағы және жаңа құпиясөзді дұрыс енгізіңіз'}},400);
  if(parsed.data.currentPassword===parsed.data.newPassword)return c.json({error:{code:'PASSWORD_UNCHANGED',message:'Жаңа құпиясөз бұрынғысынан өзгеше болуы керек'}},400);
  const row=await c.env.DB.prepare('SELECT password_hash FROM users WHERE id=?').bind(user.id).first<{password_hash:string|null}>();
  if(!row?.password_hash||!(await verifyCurrentPassword(parsed.data.currentPassword,row.password_hash)))return c.json({error:{code:'INVALID_PASSWORD',message:'Ағымдағы құпиясөз қате'}},401);
  await c.env.DB.prepare("UPDATE users SET password_hash=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(await hashNewPassword(parsed.data.newPassword),user.id).run();
  await c.env.DB.prepare("INSERT INTO audit_logs(id,actor_user_id,action,resource_type,resource_id,department_id) VALUES(?,?,'PASSWORD_CHANGED','USER',?,?)").bind(crypto.randomUUID(),user.id,user.id,user.departmentId).run();
  return c.json({ok:true,message:'Құпиясөз жаңартылды'});
});

export default app;
)) return false;
  const [, rawIterations, rawSalt, rawHash] = stored.split('
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
);
  if (Number(rawIterations) !== 100000 || !rawSalt || !rawHash) return false;
  try {
    const decode = (value: string) => {
      const base64=value.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-(value.length%4))%4);
      return Uint8Array.from(atob(base64),ch=>ch.charCodeAt(0));
    };
    const salt=decode(rawSalt),expected=decode(rawHash);
    if(salt.length!==16||expected.length!==32)return false;
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
    const saltBuffer=new ArrayBuffer(salt.length);new Uint8Array(saltBuffer).set(salt);
    const actual=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:saltBuffer,iterations:100000},key,256));
    let mismatch=0;for(let i=0;i<actual.length;i++)mismatch|=actual[i]^expected[i];
    return mismatch===0;
  } catch { return false; }
}
async function hashNewPassword(password: string): Promise<string> {
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},key,256));
  const encode=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  return `pbkdf2$100000${encode(salt)}${encode(bits)}`;
}

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
