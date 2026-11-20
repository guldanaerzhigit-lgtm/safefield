import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import { requireRoles } from '../middleware/authorize';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.use('*', authMiddleware);
app.use('*', requireRoles('ADMIN'));

const roleSchema = z.enum(['EMPLOYEE','SUPERVISOR','DISPATCHER','SAFETY_MANAGER','ADMIN']);
const userCreateSchema = z.object({
  email: z.email().max(254),
  fullName: z.string().min(2).max(160),
  phone: z.string().max(40).optional(),
  password: z.string().min(12).max(128),
  role: roleSchema,
  departmentId: z.string().nullable().optional(),
  supervisorId: z.string().nullable().optional(),
});
const departmentSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(24).regex(/^[A-Za-z0-9_-]+$/),
  parentId: z.string().nullable().optional(),
});
const userUpdateSchema = z.object({
  fullName: z.string().min(2).max(160).optional(),
  phone: z.string().max(40).nullable().optional(),
  role: roleSchema.optional(),
  departmentId: z.string().nullable().optional(),
  supervisorId: z.string().nullable().optional(),
  status: z.enum(['ACTIVE','SUSPENDED','DISABLED']).optional(),
});

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}
async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt, iterations:100000 }, key, 256));
  return 'pbkdf2$100000$' + b64url(salt) + '$' + b64url(bits);
}
async function audit(c: any, action: string, type: string, id: string, departmentId: string | null = null) {
  const actor = c.get('user');
  await c.env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,action,resource_type,resource_id,department_id) VALUES(?,?,?,?,?,?)')
    .bind(crypto.randomUUID(), actor.id, action, type, id, departmentId).run();
}

app.get('/overview', async c => {
  const [users, departments, invites, suspended] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{n:number}>(),
    c.env.DB.prepare('SELECT COUNT(*) AS n FROM departments WHERE is_active=1').first<{n:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE status='INVITED'").first<{n:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM users WHERE status IN ('SUSPENDED','DISABLED')").first<{n:number}>(),
  ]);
  return c.json({ overview: { users: users?.n || 0, departments: departments?.n || 0, invited: invites?.n || 0, inactive: suspended?.n || 0 } });
});
app.get('/users', async c => {
  const result = await c.env.DB.prepare(`SELECT u.id,u.email,u.full_name AS fullName,u.phone,u.status,u.locale,u.last_login_at AS lastLoginAt,u.created_at AS createdAt,r.code AS role,r.name AS roleName,u.department_id AS departmentId,d.name AS departmentName,u.supervisor_id AS supervisorId,s.full_name AS supervisorName FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN departments d ON d.id=u.department_id LEFT JOIN users s ON s.id=u.supervisor_id ORDER BY u.created_at DESC`).all();
  return c.json({ users: result.results });
});
app.get('/departments', async c => {
  const result = await c.env.DB.prepare(`SELECT d.id,d.name,d.code,d.parent_id AS parentId,d.is_active AS isActive,d.created_at AS createdAt,p.name AS parentName,(SELECT COUNT(*) FROM users u WHERE u.department_id=d.id) AS employeeCount FROM departments d LEFT JOIN departments p ON p.id=d.parent_id ORDER BY d.name`).all();
  return c.json({ departments: result.results });
});
app.get('/roles', async c => {
  const result = await c.env.DB.prepare('SELECT id,code,name,permissions_json AS permissionsJson FROM roles ORDER BY CASE code WHEN \'ADMIN\' THEN 1 WHEN \'SAFETY_MANAGER\' THEN 2 WHEN \'DISPATCHER\' THEN 3 WHEN \'SUPERVISOR\' THEN 4 ELSE 5 END').all();
  return c.json({ roles: result.results });
});
app.post('/departments', async c => {
  const parsed = departmentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error:{code:'VALIDATION_ERROR',message:'Бөлімше атауы мен кодын тексеріңіз'} },400);
  const data=parsed.data; const id=crypto.randomUUID();
  try {
    await c.env.DB.prepare('INSERT INTO departments(id,name,code,parent_id) VALUES(?,?,?,?)').bind(id,data.name.trim(),data.code.toUpperCase(),data.parentId || null).run();
  } catch { return c.json({error:{code:'CONFLICT',message:'Бұл бөлімше коды қолданылып тұр немесе жоғары тұрған бөлімше табылмады'}},409); }
  await audit(c,'DEPARTMENT_CREATED','DEPARTMENT',id);
  return c.json({ok:true,id},201);
});
app.patch('/departments/:id', async c => {
  const data = await c.req.json().catch(()=>null) as {name?:string;isActive?:boolean}|null;
  if (!data || (data.name !== undefined && (typeof data.name !== 'string' || data.name.trim().length < 2)) || (data.isActive !== undefined && typeof data.isActive !== 'boolean')) return c.json({error:{code:'VALIDATION_ERROR',message:'Бөлімше деректері дұрыс емес'}},400);
  const current=await c.env.DB.prepare('SELECT id FROM departments WHERE id=?').bind(c.req.param('id')).first();
  if(!current)return c.json({error:{code:'NOT_FOUND',message:'Бөлімше табылмады'}},404);
  await c.env.DB.prepare("UPDATE departments SET name=COALESCE(?,name),is_active=COALESCE(?,is_active),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(data.name?.trim() ?? null,data.isActive===undefined?null:(data.isActive?1:0),c.req.param('id')).run();
  await audit(c,'DEPARTMENT_UPDATED','DEPARTMENT',c.req.param('id'));
  return c.json({ok:true});
});
app.post('/users', async c => {
  const parsed=userCreateSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:{code:'VALIDATION_ERROR',message:'Барлық өрісті дұрыс толтырыңыз. Құпиясөз кемінде 12 таңбадан тұруы керек.'}},400);
  const d=parsed.data; const id=crypto.randomUUID();
  const role=await c.env.DB.prepare('SELECT id FROM roles WHERE code=?').bind(d.role).first<{id:string}>();
  if(!role)return c.json({error:{code:'INVALID_ROLE',message:'Рөл табылмады'}},400);
  if(d.departmentId){const dep=await c.env.DB.prepare('SELECT id FROM departments WHERE id=? AND is_active=1').bind(d.departmentId).first();if(!dep)return c.json({error:{code:'INVALID_DEPARTMENT',message:'Бөлімше табылмады или отключено'}},400);}
  if(d.supervisorId){const sup=await c.env.DB.prepare("SELECT id FROM users WHERE id=? AND status='ACTIVE'").bind(d.supervisorId).first();if(!sup)return c.json({error:{code:'INVALID_SUPERVISOR',message:'Топ жетекшісі табылмады немесе белсенді емес'}},400);}
  try {
    await c.env.DB.prepare("INSERT INTO users(id,email,password_hash,full_name,phone,role_id,department_id,supervisor_id,status,locale) VALUES(?,?,?,?,?,?,?,?, 'ACTIVE','kk')")
      .bind(id,d.email.trim().toLowerCase(),await hashPassword(d.password),d.fullName.trim(),d.phone?.trim()||null,role.id,d.departmentId||null,d.supervisorId||null).run();
  } catch { return c.json({error:{code:'CONFLICT',message:'Мұндай электрондық поштамен тіркелгі бар'}},409); }
  await audit(c,'USER_CREATED','USER',id,d.departmentId||null);
  return c.json({ok:true,id},201);
});
app.patch('/users/:id', async c => {
  const id=c.req.param('id'); const parsed=userUpdateSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:{code:'VALIDATION_ERROR',message:'Қызметкер деректері дұрыс емес'}},400);
  const target=await c.env.DB.prepare('SELECT id,department_id AS departmentId FROM users WHERE id=?').bind(id).first<{id:string;departmentId:string|null}>();
  if(!target)return c.json({error:{code:'NOT_FOUND',message:'Қызметкер табылмады'}},404);
  const d=parsed.data;
  if(id===c.get('user').id && (d.status==='SUSPENDED'||d.status==='DISABLED'||d.role&&d.role!=='ADMIN'))return c.json({error:{code:'SELF_LOCKOUT',message:'Әкімші өз тіркелгісін өшіре немесе рөлін төмендете алмайды'}},409);
  const roleId=d.role?(await c.env.DB.prepare('SELECT id FROM roles WHERE code=?').bind(d.role).first<{id:string}>())?.id:undefined;
  if(d.role&&!roleId)return c.json({error:{code:'INVALID_ROLE',message:'Рөл табылмады'}},400);
  if(d.departmentId){const dep=await c.env.DB.prepare('SELECT id FROM departments WHERE id=? AND is_active=1').bind(d.departmentId).first();if(!dep)return c.json({error:{code:'INVALID_DEPARTMENT',message:'Бөлімше табылмады'}},400);}
  await c.env.DB.prepare(`UPDATE users SET full_name=COALESCE(?,full_name),phone=COALESCE(?,phone),role_id=COALESCE(?,role_id),department_id=CASE WHEN ?=1 THEN ? ELSE department_id END,supervisor_id=CASE WHEN ?=1 THEN ? ELSE supervisor_id END,status=COALESCE(?,status),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`)
    .bind(d.fullName?.trim()??null,d.phone??null,roleId??null,d.departmentId!==undefined?1:0,d.departmentId??null,d.supervisorId!==undefined?1:0,d.supervisorId??null,d.status??null,id).run();
  await audit(c,'USER_UPDATED','USER',id,d.departmentId===undefined?target.departmentId:d.departmentId);
  return c.json({ok:true});
});
app.get('/audit', async c => {
  const result=await c.env.DB.prepare(`SELECT a.id,a.action,a.resource_type AS resourceType,a.resource_id AS resourceId,a.created_at AS createdAt,u.full_name AS actorName,u.email,d.name AS departmentName FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id LEFT JOIN departments d ON d.id=a.department_id ORDER BY a.created_at DESC LIMIT 150`).all();
  return c.json({logs:result.results});
});
export default app;
