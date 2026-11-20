import { Hono } from 'hono';
import { z } from 'zod';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import type { Env } from '../types';

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
app.use('*', authMiddleware);
const managers = ['SUPERVISOR','DISPATCHER','SAFETY_MANAGER','ADMIN'];
const createSchema = z.object({
  name:z.string().trim().min(2).max(160),
  assetType:z.enum(['BASE_STATION','COMMUNICATION_CABINET','TOWER','OTHER']),
  description:z.string().max(3000).optional().default(''),
  address:z.string().trim().min(3).max(500),
  departmentId:z.string().nullable().optional(),
  latitude:z.number().min(-90).max(90).nullable().optional(),
  longitude:z.number().min(-180).max(180).nullable().optional(),
  status:z.enum(['ACTIVE','MAINTENANCE','OUT_OF_SERVICE','RETIRED']).default('ACTIVE')
});
const updateSchema=createSchema.partial();
function canSee(user:any, departmentId:string|null){return user.role==='ADMIN'||user.role==='SAFETY_MANAGER'||user.role==='DISPATCHER'||(user.role==='SUPERVISOR'&&departmentId===user.departmentId)||departmentId===user.departmentId;}
async function audit(c:any,action:string,id:string,departmentId:string|null){await c.env.DB.prepare('INSERT INTO audit_logs(id,actor_user_id,action,resource_type,resource_id,department_id) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),c.get('user').id,action,'ASSET',id,departmentId).run();}
app.get('/',async c=>{
 const user=c.get('user');
 const where=user.role==='ADMIN'||user.role==='SAFETY_MANAGER'||user.role==='DISPATCHER'?'1=1':user.role==='SUPERVISOR'?'(a.department_id=? OR a.department_id IS NULL)':'a.department_id=?';
 const values=user.role==='ADMIN'||user.role==='SAFETY_MANAGER'||user.role==='DISPATCHER'?[]:[user.departmentId||''];
 const rows=await c.env.DB.prepare(`SELECT a.id,a.code,a.name,a.asset_type AS assetType,a.description,a.address,a.department_id AS departmentId,d.name AS departmentName,a.latitude,a.longitude,a.status,a.qr_token AS qrToken,a.created_at AS createdAt,(SELECT COUNT(*) FROM work_orders w WHERE w.asset_id=a.id) AS workOrderCount FROM assets a LEFT JOIN departments d ON d.id=a.department_id WHERE ${where} ORDER BY a.created_at DESC LIMIT 500`).bind(...values).all();
 return c.json({assets:rows.results});
});
app.get('/:id',async c=>{
 const asset=await c.env.DB.prepare('SELECT a.id,a.code,a.name,a.asset_type AS assetType,a.description,a.address,a.department_id AS departmentId,d.name AS departmentName,a.latitude,a.longitude,a.status,a.qr_token AS qrToken,a.created_at AS createdAt FROM assets a LEFT JOIN departments d ON d.id=a.department_id WHERE a.id=?').bind(c.req.param('id')).first<any>();
 if(!asset)return c.json({error:{code:'NOT_FOUND',message:'Нысан табылмады'}},404);
 if(!canSee(c.get('user'),asset.departmentId))return c.json({error:{code:'FORBIDDEN',message:'Бұл нысанды көруге рұқсат жоқ'}},403);
 const orders=await c.env.DB.prepare('SELECT id,code,title,status,priority,created_at AS createdAt FROM work_orders WHERE asset_id=? ORDER BY created_at DESC LIMIT 100').bind(asset.id).all();
 return c.json({asset,workOrders:orders.results});
});
app.post('/',async c=>{
 const user=c.get('user');if(!managers.includes(user.role))return c.json({error:{code:'FORBIDDEN',message:'Нысан тіркеуге рұқсат жоқ'}},403);
 const parsed=createSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:{code:'VALIDATION_ERROR',message:'Нысан деректерін тексеріңіз'}},400);
 const d=parsed.data;const id=crypto.randomUUID();const qrToken=crypto.randomUUID()+crypto.randomUUID().replaceAll('-','');const code='SFA-'+new Date().toISOString().slice(2,10).replaceAll('-','')+'-'+crypto.randomUUID().slice(0,6).toUpperCase();
 const departmentId=d.departmentId??user.departmentId??null;
 if(user.role==='SUPERVISOR'&&departmentId!==user.departmentId)return c.json({error:{code:'FORBIDDEN',message:'Өз бөлімшеңізге ғана нысан тіркей аласыз'}},403);
 try{await c.env.DB.prepare('INSERT INTO assets(id,code,name,asset_type,description,address,department_id,latitude,longitude,status,qr_token,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,code,d.name,d.assetType,d.description,d.address,departmentId,d.latitude??null,d.longitude??null,d.status,qrToken,user.id).run();}
 catch{return c.json({error:{code:'CREATE_FAILED',message:'Нысанды сақтау мүмкін болмады. Бөлімшені тексеріңіз.'}},400);}
 await audit(c,'ASSET_CREATED',id,departmentId);return c.json({ok:true,id,code},201);
});
app.patch('/:id',async c=>{
 const user=c.get('user');if(!managers.includes(user.role))return c.json({error:{code:'FORBIDDEN',message:'Нысанды өзгертуге рұқсат жоқ'}},403);
 const parsed=updateSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return c.json({error:{code:'VALIDATION_ERROR',message:'Нысан деректері дұрыс емес'}},400);
 const current=await c.env.DB.prepare('SELECT id,department_id AS departmentId FROM assets WHERE id=?').bind(c.req.param('id')).first<{id:string;departmentId:string|null}>();if(!current)return c.json({error:{code:'NOT_FOUND',message:'Нысан табылмады'}},404);
 if(user.role==='SUPERVISOR'&&current.departmentId!==user.departmentId)return c.json({error:{code:'FORBIDDEN',message:'Бұл нысанды өзгертуге рұқсат жоқ'}},403);
 const d=parsed.data;await c.env.DB.prepare(`UPDATE assets SET name=COALESCE(?,name),asset_type=COALESCE(?,asset_type),description=COALESCE(?,description),address=COALESCE(?,address),department_id=COALESCE(?,department_id),latitude=COALESCE(?,latitude),longitude=COALESCE(?,longitude),status=COALESCE(?,status),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).bind(d.name??null,d.assetType??null,d.description??null,d.address??null,d.departmentId??null,d.latitude??null,d.longitude??null,d.status??null,current.id).run();
 await audit(c,'ASSET_UPDATED',current.id,current.departmentId);return c.json({ok:true});
});
app.get('/qr/:token',async c=>{
 const asset=await c.env.DB.prepare('SELECT id,code,name,asset_type AS assetType,address,department_id AS departmentId,status FROM assets WHERE qr_token=?').bind(c.req.param('token')).first<any>();
 if(!asset)return c.json({error:{code:'NOT_FOUND',message:'QR-кодқа сәйкес нысан табылмады'}},404);
 if(!canSee(c.get('user'),asset.departmentId))return c.json({error:{code:'FORBIDDEN',message:'Бұл нысанға қол жеткізуге рұқсат жоқ'}},403);
 return c.json({asset});
});
export default app;
