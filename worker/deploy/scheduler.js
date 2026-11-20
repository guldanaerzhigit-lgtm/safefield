import { sendWebPush } from './webPush.js';
async function processEscalations(env,now){
 const due=await env.DB.prepare("SELECT x.id,x.alert_id,x.level,x.target_role,a.employee_id,e.full_name AS employee_name,e.department_id,e.supervisor_id,a.alert_type,a.priority,a.message,a.latitude,a.longitude FROM safety_escalations x JOIN safety_alerts a ON a.id=x.alert_id JOIN users e ON e.id=a.employee_id WHERE x.status='PENDING' AND x.due_at<=? AND a.status IN ('OPEN','ACKNOWLEDGED','IN_PROGRESS') AND (x.level=1 OR EXISTS(SELECT 1 FROM safety_escalations p WHERE p.alert_id=x.alert_id AND p.level=x.level-1 AND p.status IN ('SENT','FAILED'))) ORDER BY x.due_at LIMIT 100").bind(now).all();
 let sent=0,failed=0,waiting=0;
 for(const item of due.results){
  let recipients=[];
  if(item.target_role==='SUPERVISOR'&&item.supervisor_id)recipients=[{id:item.supervisor_id}];
  else recipients=(await env.DB.prepare("SELECT u.id FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code=? AND u.status='ACTIVE' AND (? IN ('ADMIN','DISPATCHER','SAFETY_MANAGER') OR u.department_id=?) LIMIT 100").bind(item.target_role,item.target_role,item.department_id).all()).results;
  const ids=[...new Set(recipients.map(r=>r.id))];
  if(!ids.length){await env.DB.prepare("UPDATE safety_escalations SET status='FAILED' WHERE id=? AND status='PENDING'").bind(item.id).run();failed++;continue;}
  let delivered=0;
  for(const userId of ids){
   const subs=await env.DB.prepare('SELECT id,user_id,endpoint,p256dh,auth FROM notification_subscriptions WHERE user_id=?').bind(userId).all();
   for(const sub of subs.results){
    try{
     if(!env.VAPID_PRIVATE_KEY||!env.VAPID_PUBLIC_KEY||!env.VAPID_SUBJECT)throw new Error('VAPID кілттері бапталмаған');
     const status=await sendWebPush(sub,{title:item.alert_type==='MISSED_CHECKIN'?'Қауіпсіздік растауы кешікті':'Шұғыл қауіпсіздік дабылы',body:item.employee_name+': '+(item.message||'Қызметкерге назар аудару қажет'),url:'/alerts',alertId:item.alert_id,priority:item.priority},env);
     delivered++;
     await env.DB.prepare("INSERT INTO notification_logs(id,user_id,alert_id,channel,template_key,status,provider_message_id,sent_at) VALUES(?,?,?,'PUSH',?,'SENT',?,?)").bind(crypto.randomUUID(),userId,item.alert_id,'ESCALATION_LEVEL_'+item.level,String(status),now).run();
     await env.DB.prepare('UPDATE notification_subscriptions SET last_used_at=? WHERE id=?').bind(now,sub.id).run();
    }catch(error){
     const message=error instanceof Error?error.message:'Push жеткізу қатесі';
     if(message.includes('HTTP 404')||message.includes('HTTP 410'))await env.DB.prepare('DELETE FROM notification_subscriptions WHERE id=?').bind(sub.id).run();
     await env.DB.prepare("INSERT INTO notification_logs(id,user_id,alert_id,channel,template_key,status,error_message) VALUES(?,?,?,'PUSH',?,'FAILED',?)").bind(crypto.randomUUID(),userId,item.alert_id,'ESCALATION_LEVEL_'+item.level,message.slice(0,500)).run();
     failed++;
    }
   }
  }
  if(delivered>0){await env.DB.prepare("UPDATE safety_escalations SET status='SENT',sent_at=? WHERE id=? AND status='PENDING'").bind(now,item.id).run();sent++;}
  else{await env.DB.prepare("UPDATE safety_escalations SET status='FAILED' WHERE id=? AND status='PENDING'").bind(item.id).run();failed++;}
 }
 return {processed:due.results.length,sent,failed,waiting};
}
export default {
 async fetch(){return new Response('SAFEFIELD scheduler is active',{status:200});},
 async scheduled(_controller,env){
  const now=new Date().toISOString();
  const dueRows=await env.DB.prepare("SELECT c.id AS checkin_id,c.session_id,c.employee_id,u.department_id FROM safety_checkins c JOIN safety_sessions s ON s.id=c.session_id JOIN users u ON u.id=c.employee_id WHERE c.responded_at IS NULL AND c.due_at<=? AND s.status='ACTIVE' ORDER BY c.due_at LIMIT 200").bind(now).all();
  for(const item of dueRows.results){
   const marked=await env.DB.prepare("UPDATE safety_checkins SET responded_at=?,response='NO_RESPONSE' WHERE id=? AND responded_at IS NULL AND due_at<=? RETURNING id").bind(now,item.checkin_id,now).first();
   if(!marked)continue;
   const alertId=crypto.randomUUID();
   await env.DB.prepare("INSERT INTO safety_alerts(id,session_id,employee_id,alert_type,priority,status,message) VALUES(?,?,?,'MISSED_CHECKIN','HIGH','OPEN','Қызметкер белгіленген уақытта қауіпсіздігін растамады')").bind(alertId,item.session_id,item.employee_id).run();
   const steps=[{level:1,role:'SUPERVISOR',minutes:5},{level:2,role:'DISPATCHER',minutes:10},{level:3,role:'SAFETY_MANAGER',minutes:15}];
   for(const step of steps){const dueAt=new Date(Date.now()+step.minutes*60_000).toISOString();await env.DB.prepare("INSERT INTO safety_escalations(id,alert_id,level,target_role,status,due_at) VALUES(?,?,?,?,'PENDING',?)").bind(crypto.randomUUID(),alertId,step.level,step.role,dueAt).run();}
   await env.DB.prepare("INSERT INTO audit_logs(id,actor_user_id,action,resource_type,resource_id,department_id) VALUES(?,NULL,'MISSED_CHECKIN_ALERT_CREATED','SAFETY_ALERT',?,?)").bind(crypto.randomUUID(),alertId,item.department_id).run();
  }
  const escalation=await processEscalations(env,now);
  console.log(JSON.stringify({event:'safety_scheduler_completed',missedCheckins:dueRows.results.length,escalation}));
 }
};
