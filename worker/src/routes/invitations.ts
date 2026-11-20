import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { z } from 'zod';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import type { Env, Role } from '../types';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const inviteRole = z.enum(['EMPLOYEE','SUPERVISOR','DISPATCHER','SAFETY_MANAGER']);
const createSchema = z.object({
  email: z.email().max(254),
  role: inviteRole,
  departmentId: z.string().min(1),
  supervisorId: z.string().nullable().optional(),
  expiresInHours: z.number().int().min(1).max(168).default(72),
});
const acceptSchema = z.object({
  token: z.string().min(32).max(128),
  fullName: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).optional(),
  password: z.string().min(12).max(128),
});

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
}
async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},key,256));
  return 'pbkdf2$100000$'+b64url(salt)+'$'+b64url(bits);
}

app.post('/accept', async c => {
  const parsed = acceptSchema.safeParse(await c.req.json().catch(()=>null));
  if (!parsed.success) return c.json({error:{code:'VALIDATION_ERROR',message:'Тіркелу мәліметтерін тексеріңіз. Құпиясөз кемінде 12 таңба болуы керек.'}},400);
  const data = parsed.data;
  const tokenHash = await digest(data.token);
  const invite = await c.env.DB.prepare(`
    SELECT i.id,i.email,i.role_id,i.department_id AS departmentId,
      i.supervisor_id AS supervisorId,i.expires_at AS expiresAt,
      i.accepted_at AS acceptedAt,i.revoked_at AS revokedAt,r.code AS role
    FROM invitations i JOIN roles r ON r.id=i.role_id
    WHERE i.token_hash=? LIMIT 1
  `).bind(tokenHash).first<{id:string;email:string;role_id:string;departmentId:string|null;supervisorId:string|null;expiresAt:string;acceptedAt:string|null;revokedAt:string|null;role:Role}>();
  if (!invite || invite.acceptedAt || invite.revokedAt || new Date(invite.expiresAt).getTime() <= Date.now()) {
    return c.json({error:{code:'INVITATION_INVALID',message:'Шақыру сілтемесі жарамсыз, қолданылған немесе мерзімі аяқталған'}},410);
  }
  const email = invite.email.trim().toLowerCase();
  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE LIMIT 1').bind(email).first();
  if (existing) return c.json({error:{code:'EMAIL_EXISTS',message:'Бұл email арқылы тіркелгі бұрыннан бар'}},409);
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(`
      INSERT INTO users(id,email,password_hash,full_name,phone,role_id,department_id,supervisor_id,status,locale)
      VALUES(?,?,?,?,?,?,?,?, 'ACTIVE','kk')
    `).bind(id,email,await hashPassword(data.password),data.fullName,data.phone?.trim()||null,invite.role_id,invite.departmentId,invite.supervisorId).run();
  } catch {
    return c.json({error:{code:'REGISTRATION_FAILED',message:'Тіркелгі жасау мүмкін болмады. Шақырудың әлі жарамды екенін тексеріңіз.'}},409);
  }
  const accepted = await c.env.DB.prepare(`
    UPDATE invitations SET accepted_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')
  `).bind(invite.id).run();
  if (accepted.meta.changes !== 1) {
    await c.env.DB.prepare('DELETE FROM users WHERE id=?').bind(id).run();
    return c.json({error:{code:'INVITATION_USED',message:'Бұл шақыру сілтемесі басқа пайдаланушымен қолданылған'}},409);
  }
  await c.env.DB.prepare(`
    INSERT INTO audit_logs(id,actor_user_id,action,resource_type,resource_id,department_id,metadata_json)
    VALUES(?,?,'INVITATION_ACCEPTED','USER',?,?,?)
  `).bind(crypto.randomUUID(),id,id,invite.departmentId,JSON.stringify({invitationId:invite.id,role:invite.role})).run();
  return c.json({ok:true,message:'Тіркелу сәтті аяқталды. Енді жүйеге кіре аласыз.'},201);
});

app.use('*', authMiddleware);
app.get('/', async c => {
  const user=c.get('user');
  if (!['ADMIN','SUPERVISOR'].includes(user.role)) return c.json({error:{code:'FORBIDDEN',message:'Шақыру жасауға рұқсат жоқ'}},403);
  const rows = user.role==='ADMIN'
    ? await c.env.DB.prepare(`SELECT i.id,i.email,r.code AS role,d.name AS departmentName,i.expires_at AS expiresAt,i.accepted_at AS acceptedAt,i.revoked_at AS revokedAt,i.created_at AS createdAt FROM invitations i JOIN roles r ON r.id=i.role_id LEFT JOIN departments d ON d.id=i.department_id ORDER BY i.created_at DESC LIMIT 100`).all()
    : await c.env.DB.prepare(`SELECT i.id,i.email,r.code AS role,d.name AS departmentName,i.expires_at AS expiresAt,i.accepted_at AS acceptedAt,i.revoked_at AS revokedAt,i.created_at AS createdAt FROM invitations i JOIN roles r ON r.id=i.role_id LEFT JOIN departments d ON d.id=i.department_id WHERE i.invited_by=? ORDER BY i.created_at DESC LIMIT 100`).bind(user.id).all();
  return c.json({invitations:rows.results});
});

app.post('/', async c => {
  const actor=c.get('user');
  if (!['ADMIN','SUPERVISOR'].includes(actor.role)) return c.json({error:{code:'FORBIDDEN',message:'Шақыру жасауға рұқсат жоқ'}},403);
  const parsed=createSchema.safeParse(await c.req.json().catch(()=>null));
  if (!parsed.success) return c.json({error:{code:'VALIDATION_ERROR',message:'Email, рөл және бөлімшені дұрыс таңдаңыз'}},400);
  const d=parsed.data;
  if (actor.role==='SUPERVISOR' && (d.role!=='EMPLOYEE' || !actor.departmentId || d.departmentId!==actor.departmentId)) {
    return c.json({error:{code:'FORBIDDEN',message:'Топ жетекшісі тек өз бөлімшесіне қызметкер шақыра алады'}},403);
  }
  const department=await c.env.DB.prepare('SELECT id FROM departments WHERE id=? AND is_active=1').bind(d.departmentId).first();
  if (!department) return c.json({error:{code:'INVALID_DEPARTMENT',message:'Белсенді бөлімше табылмады'}},400);
  let supervisorId=d.supervisorId||null;
  if (actor.role==='SUPERVISOR') supervisorId=actor.id;
  if (supervisorId) {
    const sup=await c.env.DB.prepare(`SELECT u.id,u.department_id AS departmentId,r.code AS role,u.status FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?`).bind(supervisorId).first<{id:string;departmentId:string|null;role:string;status:string}>();
    if(!sup||sup.role!=='SUPERVISOR'||sup.status!=='ACTIVE'||sup.departmentId!==d.departmentId) return c.json({error:{code:'INVALID_SUPERVISOR',message:'Осы бөлімшедегі белсенді топ жетекшісін таңдаңыз'}},400);
  }
  const email=d.email.trim().toLowerCase();
  const existing=await c.env.DB.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE LIMIT 1').bind(email).first();
  if(existing)return c.json({error:{code:'EMAIL_EXISTS',message:'Бұл email арқылы тіркелгі бар'}},409);
  const role=await c.env.DB.prepare('SELECT id FROM roles WHERE code=?').bind(d.role).first<{id:string}>();
  if(!role)return c.json({error:{code:'INVALID_ROLE',message:'Рөл табылмады'}},400);
  const token=b64url(crypto.getRandomValues(new Uint8Array(32)));
  const id=crypto.randomUUID();
  const expiresAt=new Date(Date.now()+d.expiresInHours*3600000).toISOString();
  await c.env.DB.prepare(`UPDATE invitations SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE email=? COLLATE NOCASE AND accepted_at IS NULL AND revoked_at IS NULL`).bind(email).run();
  await c.env.DB.prepare(`INSERT INTO invitations(id,email,role_id,department_id,supervisor_id,invited_by,token_hash,expires_at) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(id,email,role.id,d.departmentId,supervisorId,actor.id,await digest(token),expiresAt).run();
  await c.env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,resource_type,resource_id,department_id,metadata_json) VALUES(?,?,'INVITATION_CREATED','INVITATION',?,?,?)`)
    .bind(crypto.randomUUID(),actor.id,id,d.departmentId,JSON.stringify({email,role:d.role,expiresAt})).run();
  const origin=new URL(c.req.url).origin;
  return c.json({ok:true,invitation:{id,email,role:d.role,expiresAt,registrationUrl:origin+'/register?token='+token}},201);
});

app.post('/:id/revoke', async c => {
  const actor=c.get('user');
  if (!['ADMIN','SUPERVISOR'].includes(actor.role)) return c.json({error:{code:'FORBIDDEN',message:'Рұқсат жоқ'}},403);
  const id=c.req.param('id');
  const row=await c.env.DB.prepare('SELECT id,invited_by,accepted_at,revoked_at FROM invitations WHERE id=?').bind(id).first<{id:string;invited_by:string;accepted_at:string|null;revoked_at:string|null}>();
  if(!row)return c.json({error:{code:'NOT_FOUND',message:'Шақыру табылмады'}},404);
  if(actor.role==='SUPERVISOR'&&row.invited_by!==actor.id)return c.json({error:{code:'FORBIDDEN',message:'Өз шақыруларыңызды ғана басқара аласыз'}},403);
  if(row.accepted_at)return c.json({error:{code:'ALREADY_ACCEPTED',message:'Қабылданған шақыруды қайтару мүмкін емес'}},409);
  await c.env.DB.prepare(`UPDATE invitations SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND revoked_at IS NULL`).bind(id).run();
  await c.env.DB.prepare(`INSERT INTO audit_logs(id,actor_user_id,action,resource_type,resource_id) VALUES(?,?,'INVITATION_REVOKED','INVITATION',?)`).bind(crypto.randomUUID(),actor.id,id).run();
  return c.json({ok:true});
});
export default app;
