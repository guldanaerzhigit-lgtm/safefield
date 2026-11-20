import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, MapPin, Plus, RefreshCw, ShieldCheck, Siren } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

type SafetySession = {
  id: string; title: string; site_address: string; activity_name: string; status: string;
  planned_start_at: string; planned_end_at: string; checkin_interval_minutes: number;
};
const activities = [
  { id: 'activity_installation', name: 'Монтажные работы' },
  { id: 'activity_maintenance', name: 'Техническое обслуживание' },
  { id: 'activity_height', name: 'Работа на высоте' },
  { id: 'activity_electrical', name: 'Электротехнические работы' },
  { id: 'activity_emergency', name: 'Аварийно-восстановительные работы' },
  { id: 'activity_other', name: 'Другое' }
];
function localDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function getLocation(): Promise<{ latitude?: number; longitude?: number }> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
export function SessionsPage() {
  const [sessions, setSessions] = useState<SafetySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [address, setAddress] = useState('');
  const [activityTypeId, setActivityTypeId] = useState(activities[0].id);
  const [startAt, setStartAt] = useState(localDateTime(new Date()));
  const [endAt, setEndAt] = useState(localDateTime(new Date(Date.now() + 2 * 60 * 60 * 1000)));
  const [interval, setInterval] = useState('30');

  async function load() {
    setLoading(true); setError('');
    try { const result = await api<{ sessions: SafetySession[] }>('/sessions'); setSessions(result.sessions); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось загрузить сессии'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function createSession(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError(''); setNotice('');
    try {
      await api('/sessions', { method: 'POST', body: JSON.stringify({
        activityTypeId, title, siteAddress: address, plannedStartAt: new Date(startAt).toISOString(),
        plannedEndAt: new Date(endAt).toISOString(), checkinIntervalMinutes: Number(interval)
      }) });
      setNotice('Рабочая сессия создана. Запустите её перед началом работ.');
      setShowForm(false); setTitle(''); setAddress(''); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось создать сессию'); }
    finally { setSaving(false); }
  }
  async function runAction(session: SafetySession, action: 'start' | 'checkin' | 'sos' | 'complete') {
    setError(''); setNotice('');
    try {
      if (action === 'sos' && !window.confirm('Отправить экстренный сигнал SOS диспетчеру?')) return;
      const location = action === 'checkin' || action === 'sos' ? await getLocation() : {};
      const payload = action === 'checkin' ? { response: 'SAFE', ...location } : action === 'sos' ? { message: 'Экстренная помощь требуется', ...location } : undefined;
      await api('/sessions/' + session.id + '/' + action, { method: 'POST', ...(payload ? { body: JSON.stringify(payload) } : {}) });
      const messages = { start: 'Рабочая сессия начата. Контрольный Check-in запланирован.', checkin: 'Check-in принят. Следующее подтверждение запланировано.', sos: 'SOS отправлен. Не закрывайте приложение и следуйте корпоративной инструкции.', complete: 'Рабочая сессия завершена.' };
      setNotice(messages[action]); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Операция не выполнена'); }
  }

  return <main className="sessions-page">
    <header className="sessions-top"><Link to="/" className="back-link"><ArrowLeft size={17}/> На панель</Link><span className="sessions-brand"><ShieldCheck size={20}/> SAFEFIELD</span></header>
    <section className="sessions-content">
      <div className="sessions-heading"><div><div className="eyebrow light">FIELD OPERATIONS / SAFETY SESSIONS</div><h1>Рабочие сессии</h1><p>Создавайте выезды, подтверждайте безопасность и отправляйте сигнал SOS.</p></div><button className="create-session-btn" onClick={() => setShowForm(v => !v)}><Plus size={17}/>{showForm ? 'Закрыть' : 'Новая сессия'}</button></div>
      {error && <div className="api-warning"><AlertTriangle size={17}/><span>{error}</span></div>}
      {notice && <div className="session-notice"><CheckCircle2 size={17}/><span>{notice}</span></div>}
      {showForm && <form className="session-form" onSubmit={createSession}>
        <div className="session-form-head"><div><h2>Новая рабочая сессия</h2><p>Заполните данные выезда до начала работ.</p></div></div>
        <div className="session-form-grid">
          <label>Название работ<input value={title} onChange={e => setTitle(e.target.value)} minLength={3} maxLength={160} placeholder="Например, обслуживание базовой станции" required/></label>
          <label>Вид деятельности<select value={activityTypeId} onChange={e => setActivityTypeId(e.target.value)}>{activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="full-field">Адрес / место работ<input value={address} onChange={e => setAddress(e.target.value)} minLength={3} maxLength={500} placeholder="Адрес объекта или координатное описание" required/></label>
          <label>Плановое начало<input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} required/></label>
          <label>Плановое завершение<input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} required/></label>
          <label>Интервал Check-in<select value={interval} onChange={e => setInterval(e.target.value)}><option value="15">Каждые 15 минут</option><option value="30">Каждые 30 минут</option><option value="45">Каждые 45 минут</option><option value="60">Каждый час</option><option value="120">Каждые 2 часа</option></select></label>
        </div>
        <div className="session-form-actions"><button type="button" className="secondary-btn" onClick={() => setShowForm(false)}>Отмена</button><button className="create-session-btn" disabled={saving}>{saving ? 'Сохранение...' : 'Создать сессию'}</button></div>
      </form>}
      <div className="sessions-list-head"><div><h2>Мои выезды</h2><p>Сессии, назначенные на вашу учётную запись</p></div><button className="refresh-btn" onClick={() => void load()} aria-label="Обновить"><RefreshCw size={16}/></button></div>
      {loading ? <div className="sessions-empty">Загрузка рабочих сессий...</div> : sessions.length === 0 ? <div className="sessions-empty"><div><ShieldCheck size={27}/></div><b>Рабочих сессий пока нет</b><span>Создайте сессию перед выездом на объект.</span></div> : <div className="sessions-list">{sessions.map(session => <article className="session-card" key={session.id}>
        <div className="session-card-main"><div className="session-card-title"><div><h3>{session.title}</h3><span className={'session-status ' + session.status.toLowerCase()}>{session.status === 'PLANNED' ? 'Запланирована' : session.status === 'ACTIVE' ? 'Активна' : session.status === 'COMPLETED' ? 'Завершена' : session.status}</span></div></div><div className="session-meta"><span><MapPin size={14}/>{session.site_address}</span><span><Clock3 size={14}/>{formatDate(session.planned_start_at)} — {formatDate(session.planned_end_at)}</span><span><RefreshCw size={14}/>Check-in: {session.checkin_interval_minutes} мин.</span></div><small className="session-activity">{session.activity_name}</small></div>
        <div className="session-actions">
          {session.status === 'PLANNED' && <button className="create-session-btn" onClick={() => void runAction(session,'start')}>Начать работу</button>}
          {session.status === 'ACTIVE' && <><button className="safe-checkin-btn" onClick={() => void runAction(session,'checkin')}><CheckCircle2 size={16}/>Я в безопасности</button><button className="sos-btn" onClick={() => void runAction(session,'sos')}><Siren size={16}/>SOS</button><button className="secondary-btn" onClick={() => void runAction(session,'complete')}>Завершить</button></>}
        </div>
      </article>)}</div>}
      <p className="sessions-disclaimer"><AlertTriangle size={14}/> SOS через приложение требует подключения к интернету и не заменяет утверждённые каналы экстренной связи компании.</p>
    </section>
  </main>;
}
