import { Hono } from 'hono';
import { authMiddleware,type AuthVariables } from '../middleware/auth';
import type { Env } from '../types';
const app=new Hono<{Bindings:Env;Variables:AuthVariables}>();app.use('*',authMiddleware);
app.get('/overview',async c=>{
 const user=c.get('user');if(!['ADMIN','SAFETY_MANAGER'].includes(user.role))return c.json({error:{code:'FORBIDDEN',message:'Қауіпсіздік аналитикасын көруге рұқсат жоқ'}},403);
 const raw=Number(c.req.query('days')||30);const days=[7,30,90].includes(raw)?raw:30;const cutoff=new Date(Date.now()-days*86400000).toISOString();
 const [sessions,alerts,checkins,trendSessions,trendAlerts,departments,activities]=await Promise.all([
  c.env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) AS completed,SUM(CASE WHEN status='ACTIVE' THEN 1 ELSE 0 END) AS active FROM safety_sessions WHERE created_at>=?`).bind(cutoff).first(),
  c.env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS') THEN 1 ELSE 0 END) AS open,SUM(CASE WHEN alert_type='MISSED_CHECKIN' THEN 1 ELSE 0 END) AS missed,SUM(CASE WHEN alert_type IN ('SOS','HIDDEN_SOS') THEN 1 ELSE 0 END) AS sos,AVG(CASE WHEN acknowledged_at IS NOT NULL THEN (julianday(acknowledged_at)-julianday(created_at))*86400 END) AS avgResponseSeconds FROM safety_alerts WHERE created_at>=?`).bind(cutoff).first(),
  c.env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN response='SAFE' THEN 1 ELSE 0 END) AS safe,SUM(CASE WHEN response='NEED_HELP' THEN 1 ELSE 0 END) AS help,SUM(CASE WHEN response='NO_RESPONSE' THEN 1 ELSE 0 END) AS missed FROM safety_checkins WHERE due_at>=?`).bind(cutoff).first(),
  c.env.DB.prepare(`SELECT strftime('%Y-%m-%d',created_at) AS day,COUNT(*) AS count FROM safety_sessions WHERE created_at>=? GROUP BY day ORDER BY day`).bind(cutoff).all(),
  c.env.DB.prepare(`SELECT strftime('%Y-%m-%d',created_at) AS day,COUNT(*) AS count FROM safety_alerts WHERE created_at>=? GROUP BY day ORDER BY day`).bind(cutoff).all(),
  c.env.DB.prepare(`SELECT d.id,d.name,COUNT(DISTINCT s.id) AS sessions,COUNT(DISTINCT a.id) AS alerts FROM departments d LEFT JOIN users u ON u.department_id=d.id LEFT JOIN safety_sessions s ON s.employee_id=u.id AND s.created_at>=? LEFT JOIN safety_alerts a ON a.employee_id=u.id AND a.created_at>=? WHERE d.is_active=1 GROUP BY d.id,d.name ORDER BY alerts DESC,sessions DESC LIMIT 20`).bind(cutoff,cutoff).all(),
  c.env.DB.prepare(`SELECT t.name,COUNT(s.id) AS sessions FROM safety_activity_types t LEFT JOIN safety_sessions s ON s.activity_type_id=t.id AND s.created_at>=? GROUP BY t.id,t.name ORDER BY sessions DESC`).bind(cutoff).all()
 ]);
 const total=Number((checkins as any)?.total||0);const safe=Number((checkins as any)?.safe||0);
 return c.json({days,summary:{sessionsTotal:Number((sessions as any)?.total||0),sessionsCompleted:Number((sessions as any)?.completed||0),sessionsActive:Number((sessions as any)?.active||0),alertsTotal:Number((alerts as any)?.total||0),alertsOpen:Number((alerts as any)?.open||0),missedCheckins:Number((alerts as any)?.missed||0),sosCount:Number((alerts as any)?.sos||0),avgResponseSeconds:(alerts as any)?.avgResponseSeconds==null?null:Math.round(Number((alerts as any).avgResponseSeconds)),checkinCompliance:total?Math.round(safe/total*100):100,checkinsTotal:total,checkinsHelp:Number((checkins as any)?.help||0),checkinsMissed:Number((checkins as any)?.missed||0)},trend:{sessions:trendSessions.results,alerts:trendAlerts.results},departments:departments.results,activities:activities.results,generatedAt:new Date().toISOString()});
});
export default app;
