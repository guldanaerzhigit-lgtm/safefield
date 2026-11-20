import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, Clock3, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

type SafetyAlert = {
  id: string; employee_name: string; alert_type: string; priority: string; status: string;
  message: string | null; latitude: number | null; longitude: number | null; created_at: string;
};
function labelStatus(status:string) {
  return ({OPEN:'Открыта',ACKNOWLEDGED:'Принята',IN_PROGRESS:'В работе',RESOLVED:'Решена',FALSE_ALARM:'Ложная тревога'} as Record<string,string>)[status] || status;
}
function labelType(type:string) {
  return ({SOS:'SOS',HIDDEN_SOS:'Скрытый SOS',MISSED_CHECKIN:'Пропущен Check-in',RISK_ZONE:'Опасная зона',MANUAL:'Запрос помощи',SYSTEM:'Системная тревога'} as Record<string,string>)[type] || type;
}
function formatDate(value:string) { return new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)); }

export function AlertsPage() {
  const [alerts,setAlerts]=useState<SafetyAlert[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState('');
  async function load() {
    setLoading(true);setError('');
    try { const result=await api<{alerts:SafetyAlert[]}>('/alerts');setAlerts(result.alerts); }
    catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить тревоги');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);
  async function act(alert:SafetyAlert,action:'acknowledge'|'resolve') {
    let body: string | undefined;
    if(action==='resolve') {
      const note=window.prompt('Кратко опишите, как была устранена ситуация:');
      if(!note?.trim())return;
      body=JSON.stringify({note});
    }
    setBusy(alert.id);setError('');setNotice('');
    try {
      await api('/alerts/'+alert.id+'/'+action,{method:'POST',...(body?{body}:{})});
      setNotice(action==='acknowledge'?'Тревога принята в работу.':'Тревога закрыта с записью результата.');
      await load();
    } catch(e){setError(e instanceof Error?e.message:'Не удалось обновить тревогу');}
    finally{setBusy('');}
  }
  return <main className="sessions-page">
    <header className="sessions-top"><Link to="/" className="back-link"><ArrowLeft size={17}/> На панель</Link><span className="sessions-brand"><ShieldCheck size={20}/> SAFEFIELD</span></header>
    <section className="sessions-content">
      <div className="sessions-heading"><div><div className="eyebrow light">SAFETY OPERATIONS / INCIDENT CENTER</div><h1>Центр тревог</h1><p>SOS, пропущенные Check-in и запросы помощи полевых сотрудников.</p></div><button className="refresh-btn" onClick={()=>void load()} aria-label="Обновить"><RefreshCw size={16}/></button></div>
      {error&&<div className="api-warning"><AlertTriangle size={17}/><span>{error}</span></div>}
      {notice&&<div className="session-notice"><Check size={17}/><span>{notice}</span></div>}
      <div className="alerts-summary"><div><b>{alerts.filter(a=>['OPEN','ACKNOWLEDGED','IN_PROGRESS'].includes(a.status)).length}</b><span>Активные тревоги</span></div><div><b>{alerts.filter(a=>a.priority==='CRITICAL'&&a.status!=='RESOLVED').length}</b><span>Критические</span></div><div><b>{alerts.filter(a=>a.status==='RESOLVED').length}</b><span>Решённые</span></div></div>
      {loading?<div className="sessions-empty">Загрузка тревог...</div>:alerts.length===0?<div className="sessions-empty"><div><ShieldCheck size={27}/></div><b>Открытых тревог пока нет</b><span>Новые сигналы SOS и пропущенные Check-in появятся здесь.</span></div>:<div className="alerts-list">{alerts.map(alert=><article className="alert-card" key={alert.id}>
        <div className="alert-card-top"><div className="alert-title"><span className={'alert-priority '+alert.priority.toLowerCase()}><AlertTriangle size={16}/></span><div><h3>{labelType(alert.alert_type)}</h3><span className="alert-employee">{alert.employee_name}</span></div></div><span className={'session-status '+alert.status.toLowerCase()}>{labelStatus(alert.status)}</span></div>
        <p className="alert-message">{alert.message||'Сообщение отсутствует'}</p>
        <div className="alert-meta"><span><Clock3 size={14}/>{formatDate(alert.created_at)}</span>{alert.latitude!=null&&alert.longitude!=null&&<span><MapPin size={14}/>{alert.latitude.toFixed(5)}, {alert.longitude.toFixed(5)}</span>}<span className="alert-priority-label">Приоритет: {alert.priority}</span></div>
        <div className="alert-actions">{alert.status==='OPEN'&&<button className="safe-checkin-btn" disabled={busy===alert.id} onClick={()=>void act(alert,'acknowledge')}>Принять в работу</button>}{['OPEN','ACKNOWLEDGED','IN_PROGRESS'].includes(alert.status)&&<button className="create-session-btn" disabled={busy===alert.id} onClick={()=>void act(alert,'resolve')}>Закрыть тревогу</button>}</div>
      </article>)}</div>}
    </section>
  </main>;
}
