import type { D1Database } from './types';

type SchedulerEnv = { DB: D1Database };

export default {
  async fetch() {
    return new Response('SAFEFIELD scheduler is active', { status: 200 });
  },

  async scheduled(_controller: unknown, env: SchedulerEnv) {
    const now = new Date().toISOString();
    const dueRows = await env.DB.prepare(
      "SELECT c.id AS checkin_id,c.session_id,c.employee_id,u.department_id FROM safety_checkins c JOIN safety_sessions s ON s.id=c.session_id JOIN users u ON u.id=c.employee_id WHERE c.responded_at IS NULL AND c.due_at<=? AND s.status='ACTIVE' ORDER BY c.due_at LIMIT 200"
    ).bind(now).all<{
      checkin_id: string;
      session_id: string;
      employee_id: string;
      department_id: string | null;
    }>();

    for (const item of dueRows.results) {
      const marked = await env.DB.prepare(
        "UPDATE safety_checkins SET responded_at=?,response='NO_RESPONSE' WHERE id=? AND responded_at IS NULL AND due_at<=? RETURNING id"
      ).bind(now, item.checkin_id, now).first<{ id: string }>();
      if (!marked) continue;

      const alertId = crypto.randomUUID();
      await env.DB.prepare(
        "INSERT INTO safety_alerts (id,session_id,employee_id,alert_type,priority,status,message) VALUES (?,?,?,'MISSED_CHECKIN','HIGH','OPEN','Қызметкер белгіленген уақытта қауіпсіздігін растамады')"
      ).bind(alertId, item.session_id, item.employee_id).run();

      const steps = [
        { level: 1, role: 'SUPERVISOR', minutes: 5 },
        { level: 2, role: 'DISPATCHER', minutes: 10 },
        { level: 3, role: 'SAFETY_MANAGER', minutes: 15 }
      ] as const;

      for (const step of steps) {
        const dueAt = new Date(Date.now() + step.minutes * 60_000).toISOString();
        await env.DB.prepare(
          "INSERT INTO safety_escalations (id,alert_id,level,target_role,status,due_at) VALUES (?,?,?,?,'PENDING',?)"
        ).bind(crypto.randomUUID(), alertId, step.level, step.role, dueAt).run();
      }

      await env.DB.prepare(
        "INSERT INTO audit_logs (id,actor_user_id,action,resource_type,resource_id,department_id) VALUES (?,NULL,'MISSED_CHECKIN_ALERT_CREATED','SAFETY_ALERT',?,?)"
      ).bind(crypto.randomUUID(), alertId, item.department_id).run();
    }

    console.log(JSON.stringify({
      event: 'missed_checkins_processed',
      count: dueRows.results.length,
      at: now
    }));
  }
};
