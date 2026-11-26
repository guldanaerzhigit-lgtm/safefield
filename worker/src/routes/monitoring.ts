import { Hono } from 'hono';
import { authMiddleware, type AuthVariables } from '../middleware/auth';
import type { Env } from '../types';
const app=new Hono<{Bindings:Env;Variables:AuthVariables}>();app.use('*',authMiddleware);
app.get('/',async c=>{
 const u=c.get('user');
 if(!['SUPERVISOR','DISPATCHER','SAFETY_MANAGER','ADMIN'].includes(u.role))return c.json({error:{code:'FORBIDDEN',message:'Қызметкерлердің орналасқан жерін көруге рұқсат жоқ'}},403);
 let scope='';let params:unknown[]=[];
 if(u.role==='SUPERVISOR'){scope=' AND e.supervisor_id=?';params=[u.id];}
 const employees=await c.env.DB.prepare(`SELECT e.id,e.full_name AS fullName,e.phone,e.department_id AS departmentId,d.name AS departmentName,s.id AS sessionId,s.title AS sessionTitle,s.site_address AS siteAddress,s.status AS sessionStatus,s.started_at AS startedAt,(SELECT l.latitude FROM safety_locations l WHERE l.employee_id=e.id ORDER BY l.recorded_at DESC LIMIT 1) AS latitude,(SELECT l.longitude FROM safety_locations l WHERE l.employee_id=e.id ORDER BY l.recorded_at DESC LIMIT 1) AS longitude,(SELECT l.accuracy FROM safety_locations l WHERE l.employee_id=e.id ORDER BY l.recorded_at DESC LIMIT 1) AS accuracy,(SELECT l.recorded_at FROM safety_locations l WHERE l.employee_id=e.id ORDER BY l.recorded_at DESC LIMIT 1) AS locationAt FROM users e LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN safety_sessions s ON s.employee_id=e.id AND s.status='ACTIVE' WHERE e.status='ACTIVE' AND EXISTS(SELECT 1 FROM roles r WHERE r.id=e.role_id AND r.code='EMPLOYEE')${scope} ORDER BY CASE WHEN s.id IS NULL THEN 1 ELSE 0 END,e.full_name LIMIT 500`).bind(...params).all();
 const alerts=await c.env.DB.prepare(`SELECT a.id,a.alert_type AS alertType,a.priority,a.status,a.message,a.latitude,a.longitude,a.created_at AS createdAt,e.full_name AS employeeName,e.supervisor_id AS supervisorId FROM safety_alerts a JOIN users e ON e.id=a.employee_id WHERE a.status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS')${u.role==='SUPERVISOR'?' AND e.supervisor_id=?':''} ORDER BY CASE a.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,a.created_at DESC LIMIT 200`).bind(...(u.role==='SUPERVISOR'?[u.id]:[])).all();
 const zones=await c.env.DB.prepare("SELECT id,name,zone_type AS zoneType,center_lat AS centerLat,center_lng AS centerLng,radius_meters AS radiusMeters FROM safety_zones WHERE is_active=1 AND (department_id IS NULL OR department_id=? OR ? IN ('ADMIN','SAFETY_MANAGER')) ORDER BY name").bind(u.departmentId||'',u.role).all();
 return c.json({employees:employees.results,alerts:alerts.results,zones:zones.results,generatedAt:new Date().toISOString()});
});
export default app;
