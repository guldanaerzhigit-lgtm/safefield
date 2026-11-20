import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.use('*', authMiddleware);

const managers = ['SUPERVISOR','DISPATCHER','SAFETY_MANAGER','ADMIN'];
const createSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().max(3000).optional().default(''),
  siteAddress: z.string().trim().min(3).max(500),
  assignedTo: z.string().min(1),
  dueAt: z.iso.datetime().nullable().optional(),
  priority: z.enum(['LOW','MEDIUM','HIGH','CRITICAL']).default('MEDIUM'),
  checkpoints: z.array(z.object({ title: z.string().trim().min(2).max(120), siteAddress: z.string().max(500).optional(), latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional() })).max(20).default([])
});
const transitionSchema = z.object({ action: z.enum(['accept','start','submit','complete','return','cancel']), note: z.string().max(1000).optional() });
const scanSchema = z.object({ code: z.string().min(8).max(100), latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional(), accuracy: z.number().min(0).max(10000).nullable().optional() });
const evidenceSchema = z.object({ evidenceType: z.enum(['BEFORE','AFTER','OTHER']), fileName: z.string().min(1).max(180), mimeType: z.enum(['image/jpeg','image/png','image/webp']), photoData: z.string().min(20).max(1_500_000), latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional(), accuracy: z.number().min(0).max(10000).nullable().optional(), capturedAt: z.iso.datetime() });

async function getOrder(c: any, id: string) {
  const user = c.get('user');
  const order = await c.env.DB.prepare(`SELECT w.id,w.code,w.title,w.description,w.site_address AS siteAddress,w.department_id AS departmentId,w.assigned_to AS assignedTo,w.created_by AS createdBy,w.due_at AS dueAt,w.priority,w.status,w.accepted_at AS acceptedAt,w.started_at AS startedAt,w.submitted_at AS submittedAt,w.completed_at AS completedAt,w.created_at AS createdAt,u.full_name AS assigneeName,u.phone AS assigneePhone,creator.full_name AS creatorName,d.name AS departmentName FROM work_orders w JOIN users u ON u.id=w.assigned_to JOIN users creator ON creator.id=w.created_by LEFT JOIN departments d ON d.id=w.department_id WHERE w.id=?`).bind(id).first();
  if (!order) return { error: c.json({error:{code:'NOT_FOUND',message:'Жұмыс тапсырмасы табылмады'}},404) };
  const canManage = ['ADMIN','SAFETY_MANAGER','DISPATCHER'].includes(user.role) || (user.role==='SUPERVISOR' && (order.departmentId===user.departmentId || order.createdBy===user.id));
  if (!canManage && order.assignedTo!==user.id && order.createdBy!==user.id) return { error: c.json({error:{code:'FORBIDDEN',message:'Бұл тапсырмаға қол жеткізуге рұқсат жоқ'}},403) };
  return { order, canManage };
}
async function audit(c:any, action:string, id:string, departmentId:string|null) {
  await c.env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,action,resource_type,resource_id,department_id) VALUES(?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),c.get('user').id,action,'WORK_ORDER',id,departmentId).run();
}

app.get('/assignees', async c => {
  const user=c.get('user');
  if (!managers.includes(user.role)) return c.json({error:{code:'FORBIDDEN',message:'Қызметкер тағайындауға рұқсат жоқ'}},403);
  const rows = user.role==='ADMIN' || user.role==='SAFETY_MANAGER' || user.role==='DISPATCHER'
    ? await c.env.DB.prepare(`SELECT u.id,u.full_name AS fullName,u.department_id AS departmentId,d.name AS departmentName FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN departments d ON d.id=u.department_id WHERE r.code='EMPLOYEE' AND u.status='ACTIVE' ORDER BY d.name,u.full_name`).all()
    : await c.env.DB.prepare(`SELECT u.id,u.full_name AS fullName,u.department_id AS departmentId,d.name AS departmentName FROM users u JOIN roles r ON r.id=u.role_id LEFT JOIN departments d ON d.id=u.department_id WHERE r.code='EMPLOYEE' AND u.status='ACTIVE' AND u.department_id=? AND (u.supervisor_id=? OR u.supervisor_id IS NULL) ORDER BY u.full_name`).bind(user.departmentId||'',user.id).all();
  return c.json({assignees:rows.results});
});

app.get('/', async c => {
  const user=c.get('user');
  const where = user.role==='EMPLOYEE' ? 'w.assigned_to=?' : user.role==='SUPERVISOR' ? '(w.department_id=? OR w.created_by=?)' : '1=1';
  const values = user.role==='EMPLOYEE' ? [user.id] : user.role==='SUPERVISOR' ? [user.departmentId||'',user.id] : [];
  const rows=await c.env.DB.prepare(`SELECT w.id,w.code,w.title,w.description,w.site_address AS siteAddress,w.assigned_to AS assignedTo,w.due_at AS dueAt,w.priority,w.status,w.created_at AS createdAt,u.full_name AS assigneeName,creator.full_name AS creatorName,(SELECT COUNT(*) FROM work_order_checkpoints cp WHERE cp.work_order_id=w.id AND cp.is_active=1) AS checkpointCount,(SELECT COUNT(*) FROM work_order_checkpoint_scans sc WHERE sc.work_order_id=w.id) AS scannedCount,(SELECT COUNT(*) FROM work_order_evidence ev WHERE ev.work_order_id=w.id) AS evidenceCount FROM work_orders w JOIN users u ON u.id=w.assigned_to JOIN users creator ON creator.id=w.created_by WHERE ${where} ORDER BY CASE w.status WHEN 'NEW' THEN 0 WHEN 'IN_PROGRESS' THEN 1 WHEN 'RETURNED' THEN 2 WHEN 'REVIEW' THEN 3 ELSE 4 END,w.due_at IS NULL,w.due_at ASC,w.created_at DESC LIMIT 300`).bind(...values).all();
  return c.json({orders:rows.results});
});

app.post('/', async c => {
  const user=c.get('user');
  if (!managers.includes(user.role)) return c.json({error:{code:'FORBIDDEN',message:'Жұмыс тапсырмасын құруға рұқсат жоқ'}},403);
  const parsed=createSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:{code:'VALIDATION_ERROR',message:'Тапсырма деректерін тексеріңіз'}},400);
  const d=parsed.data;
  const assignee=await c.env.DB.prepare(`SELECT u.id,u.department_id AS departmentId,r.code AS role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.status='ACTIVE'`).bind(d.assignedTo).first() as {id:string;departmentId:string|null;role:string}|null;
  if(!assignee || assignee.role!=='EMPLOYEE')return c.json({error:{code:'INVALID_ASSIGNEE',message:'Белсенді далалық қызметкерді таңдаңыз'}},400);
  if(user.role==='SUPERVISOR' && assignee.departmentId!==user.departmentId)return c.json({error:{code:'FORBIDDEN',message:'Өз бөлімшеңіздегі қызметкерді ғана тағайындай аласыз'}},403);
  const id=crypto.randomUUID(), now=new Date().toISOString(), code='SF-'+now.slice(2,10).replaceAll('-','')+'-'+crypto.randomUUID().slice(0,6).toUpperCase();
  try {
    await c.env.DB.prepare('INSERT INTO work_orders(id,code,title,description,site_address,department_id,assigned_to,created_by,due_at,priority) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .bind(id,code,d.title,d.description,d.siteAddress,assignee.departmentId,d.assignedTo,user.id,d.dueAt||null,d.priority).run();
    for(const cp of d.checkpoints){
      await c.env.DB.prepare('INSERT INTO work_order_checkpoints(id,work_order_id,code,title,site_address,latitude,longitude) VALUES(?,?,?,?,?,?,?)')
        .bind(crypto.randomUUID(),id,'SFC-'+crypto.randomUUID().replaceAll('-','').slice(0,18).toUpperCase(),cp.title,cp.siteAddress||d.siteAddress,cp.latitude??null,cp.longitude??null).run();
    }
  } catch { return c.json({error:{code:'CREATE_FAILED',message:'Тапсырманы құру мүмкін болмады'}},400); }
  await audit(c,'WORK_ORDER_CREATED',id,assignee.departmentId);
  return c.json({ok:true,id,code},201);
});

app.get('/:id', async c => {
  const access=await getOrder(c,c.req.param('id')); if(access.error)return access.error;
  const [checkpoints,evidence,scans]=await Promise.all([
    c.env.DB.prepare('SELECT id,code,title,site_address AS siteAddress,latitude,longitude,radius_meters AS radiusMeters,is_active AS isActive FROM work_order_checkpoints WHERE work_order_id=? ORDER BY created_at').bind(access.order.id).all(),
    c.env.DB.prepare('SELECT id,evidence_type AS evidenceType,file_name AS fileName,mime_type AS mimeType,latitude,longitude,accuracy,captured_at AS capturedAt,created_at AS createdAt,uploaded_by AS uploadedBy FROM work_order_evidence WHERE work_order_id=? ORDER BY created_at DESC').bind(access.order.id).all(),
    c.env.DB.prepare('SELECT s.id,s.checkpoint_id AS checkpointId,c.title AS checkpointTitle,s.latitude,s.longitude,s.accuracy,s.scanned_at AS scannedAt,s.result,u.full_name AS employeeName FROM work_order_checkpoint_scans s JOIN work_order_checkpoints c ON c.id=s.checkpoint_id JOIN users u ON u.id=s.employee_id WHERE s.work_order_id=? ORDER BY s.scanned_at DESC').bind(access.order.id).all()
  ]);
  return c.json({order:access.order,checkpoints:checkpoints.results,evidence:evidence.results,scans:scans.results});
});

app.post('/:id/status', async c => {
  const access=await getOrder(c,c.req.param('id')); if(access.error)return access.error;
  const user=c.get('user'), parsed=transitionSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:{code:'VALIDATION_ERROR',message:'Әрекет дұрыс көрсетілмеген'}},400);
  const {action}=parsed.data, status=access.order.status, now=new Date().toISOString();
  let next='', auditAction='';
  if(action==='accept' && user.id===access.order.assignedTo && status==='NEW'){next='ACCEPTED';auditAction='WORK_ORDER_ACCEPTED';}
  else if(action==='start' && user.id===access.order.assignedTo && ['ACCEPTED','RETURNED'].includes(status)){next='IN_PROGRESS';auditAction='WORK_ORDER_STARTED';}
  else if(action==='submit' && user.id===access.order.assignedTo && status==='IN_PROGRESS'){next='REVIEW';auditAction='WORK_ORDER_SUBMITTED';}
  else if(action==='complete' && access.canManage && status==='REVIEW'){next='COMPLETED';auditAction='WORK_ORDER_COMPLETED';}
  else if(action==='return' && access.canManage && status==='REVIEW'){next='RETURNED';auditAction='WORK_ORDER_RETURNED';}
  else if(action==='cancel' && access.canManage && ['NEW','ACCEPTED'].includes(status)){next='CANCELLED';auditAction='WORK_ORDER_CANCELLED';}
  else return c.json({error:{code:'INVALID_TRANSITION',message:'Бұл тапсырма үшін әрекет қолжетімсіз'}},409);
  await c.env.DB.prepare('UPDATE work_orders SET status=?,accepted_at=CASE WHEN ?=\'ACCEPTED\' THEN ? ELSE accepted_at END,started_at=CASE WHEN ?=\'IN_PROGRESS\' THEN ? ELSE started_at END,submitted_at=CASE WHEN ?=\'REVIEW\' THEN ? ELSE submitted_at END,completed_at=CASE WHEN ?=\'COMPLETED\' THEN ? ELSE completed_at END,updated_at=? WHERE id=?')
    .bind(next,next,now,next,now,next,now,next,now,now,access.order.id).run();
  await audit(c,auditAction,access.order.id,access.order.departmentId);
  return c.json({ok:true,status:next});
});

app.post('/:id/checkpoints/scan', async c => {
  const access=await getOrder(c,c.req.param('id')); if(access.error)return access.error;
  const user=c.get('user');
  if(user.id!==access.order.assignedTo || !['ACCEPTED','IN_PROGRESS','RETURNED'].includes(access.order.status))return c.json({error:{code:'FORBIDDEN',message:'Бақылау нүктесін тек тағайындалған қызметкер растай алады'}},403);
  const parsed=scanSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:{code:'VALIDATION_ERROR',message:'QR коды дұрыс емес'}},400);
  const cp=await c.env.DB.prepare('SELECT id,title,latitude,longitude,radius_meters AS radiusMeters FROM work_order_checkpoints WHERE code=? AND work_order_id=? AND is_active=1').bind(parsed.data.code.trim(),access.order.id).first() as {id:string;title:string;latitude:number|null;longitude:number|null;radiusMeters:number}|null;
  if(!cp)return c.json({error:{code:'CHECKPOINT_NOT_FOUND',message:'Бұл QR код тапсырманың бақылау нүктесіне тиесілі емес'}},404);
  try {
    await c.env.DB.prepare('INSERT INTO work_order_checkpoint_scans(id,checkpoint_id,work_order_id,employee_id,latitude,longitude,accuracy,scanned_at,result) VALUES(?,?,?,?,?,?,?, ?,\'VERIFIED\')')
      .bind(crypto.randomUUID(),cp.id,access.order.id,user.id,parsed.data.latitude??null,parsed.data.longitude??null,parsed.data.accuracy??null,new Date().toISOString()).run();
  } catch { return c.json({error:{code:'ALREADY_SCANNED',message:'Бұл бақылау нүктесі бұрын расталған'}},409); }
  await audit(c,'WORK_ORDER_CHECKPOINT_SCANNED',access.order.id,access.order.departmentId);
  return c.json({ok:true,checkpointTitle:cp.title});
});

app.post('/:id/evidence', async c => {
  const access=await getOrder(c,c.req.param('id')); if(access.error)return access.error;
  const user=c.get('user');
  if(user.id!==access.order.assignedTo || !['ACCEPTED','IN_PROGRESS','RETURNED'].includes(access.order.status))return c.json({error:{code:'FORBIDDEN',message:'Фотоесепті тек тағайындалған қызметкер қоса алады'}},403);
  const parsed=evidenceSchema.safeParse(await c.req.json().catch(()=>null));
  if(!parsed.success)return c.json({error:{code:'VALIDATION_ERROR',message:'Фото деректері дұрыс емес немесе файл тым үлкен'}},400);
  if(!parsed.data.photoData.startsWith('data:'+parsed.data.mimeType+';base64,'))return c.json({error:{code:'INVALID_IMAGE',message:'Сурет пішімі дұрыс емес'}},400);
  const d=parsed.data,id=crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO work_order_evidence(id,work_order_id,uploaded_by,evidence_type,file_name,mime_type,photo_data,latitude,longitude,accuracy,captured_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,access.order.id,user.id,d.evidenceType,d.fileName,d.mimeType,d.photoData,d.latitude??null,d.longitude??null,d.accuracy??null,d.capturedAt).run();
  await audit(c,'WORK_ORDER_EVIDENCE_ADDED',access.order.id,access.order.departmentId);
  return c.json({ok:true,id},201);
});

app.get('/:id/evidence/:evidenceId/photo', async c => {
  const access=await getOrder(c,c.req.param('id')); if(access.error)return access.error;
  const row=await c.env.DB.prepare('SELECT photo_data AS photoData,mime_type AS mimeType FROM work_order_evidence WHERE id=? AND work_order_id=?').bind(c.req.param('evidenceId'),access.order.id).first() as {photoData:string;mimeType:string}|null;
  if(!row)return c.json({error:{code:'NOT_FOUND',message:'Фотоесеп табылмады'}},404);
  const encoded=String(row.photoData).split(',')[1]||'';
  const binary=Uint8Array.from(atob(encoded),ch=>ch.charCodeAt(0));
  return new Response(binary,{headers:{'Content-Type':row.mimeType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
});

export default app;
