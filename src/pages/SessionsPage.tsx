import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, MapPin, Plus, RefreshCw, ShieldAlert, ShieldCheck, Siren } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

type SafetySession = {
  id: string; title: string; site_address: string; activity_name: string; status: string;
  planned_start_at: string; planned_end_at: string; checkin_interval_minutes: number;
};
const activities = [
  { id: 'activity_installation', name: 'Монтаж жұмыстары' },
  { id: 'activity_maintenance', name: 'Техникалық қызмет көрсету' },
  { id: 'activity_height', name: 'Биіктіктегі жұмыс' },
  { id: 'activity_electrical', name: 'Электр-техникалық жұмыстар' },
  { id: 'activity_emergency', name: 'Апаттық-қалпына келтіру жұмыстары' },
  { id: 'activity_other', name: 'Басқа' }
];
function localDateTime(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function getLocation(): Promise<{ latitude?: number; longitude?: number; accuracy?: number }> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve({});
    navigator.geolocation.getCurrentPosition(
      position => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('kk-KZ', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
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
    catch (e) { setError(e instanceof Error ? e.message : 'Сессияларды жүктеу мүмкін болмады'); }
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
      setNotice('Жұмыс сессиясы құрылды. Жұмысты бастамас бұрын сессияны іске қосыңыз.');
      setShowForm(false); setTitle(''); setAddress(''); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Сессияны құру мүмкін болмады'); }
    finally { setSaving(false); }
  }
  async function runAction(session: SafetySession, action: 'start' | 'checkin' | 'sos' | 'hidden-sos' | 'complete') {
    setError(''); setNotice('');
    try {
      if (action === 'sos' && !window.confirm('Диспетчерге шұғыл SOS сигналын жібересіз бе?')) return;
      const location = action === 'start' || action === 'checkin' || action === 'sos' || action === 'hidden-sos' ? await getLocation() : {};
      const payload = action === 'start' ? location : action === 'checkin' ? { response: 'SAFE', ...location } : action === 'sos' || action === 'hidden-sos' ? { message: action === 'hidden-sos' ? 'Жасырын шұғыл көмек сигналы' : 'Шұғыл көмек қажет', hidden: action === 'hidden-sos', ...location } : undefined;
      await api('/sessions/' + session.id + '/' + (action === 'hidden-sos' ? 'sos' : action), { method: 'POST', ...(payload ? { body: JSON.stringify(payload) } : {}) });
      const messages = { start: 'Жұмыс сессиясы басталды. Қауіпсіздікті растау уақыты жоспарланды.', checkin: 'Қауіпсіздік расталды. Келесі растау уақыты жоспарланды.', sos: 'SOS жіберілді. Қосымшаны жаппаңыз және компания нұсқаулығын орындаңыз.', 'hidden-sos': 'Жасырын көмек сигналы жіберілді. Қауіпсіз жерге өтіңіз.', complete: 'Жұмыс сессиясы аяқталды.' };
      setNotice(messages[action]); await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Әрекет орындалмады'); }
  }

  return <main className="sessions-page">
    <header className="sessions-top"><Link to="/" className="back-link"><ArrowLeft size={17}/> Басқару панеліне</Link><span className="sessions-brand"><ShieldCheck size={20}/> SAFEFIELD</span></header>
    <section className="sessions-content">
      <div className="sessions-heading"><div><div className="eyebrow light">ДАЛАЛЫҚ ЖҰМЫСТАР / ҚАУІПСІЗДІК СЕССИЯЛАРЫ</div><h1>Жұмыс сессиялары</h1><p>Жұмыс сапарын тіркеңіз, қауіпсіздігіңізді растаңыз және SOS сигналын жіберіңіз.</p></div><button className="create-session-btn" onClick={() => setShowForm(v => !v)}><Plus size={17}/>{showForm ? 'Жабу' : 'Жаңа сессия'}</button></div>
      {error && <div className="api-warning"><AlertTriangle size={17}/><span>{error}</span></div>}
      {notice && <div className="session-notice"><CheckCircle2 size={17}/><span>{notice}</span></div>}
      {showForm && <form className="session-form" onSubmit={createSession}>
        <div className="session-form-head"><div><h2>Жаңа жұмыс сессиясы</h2><p>Жұмысты бастамас бұрын сапар деректерін толтырыңыз.</p></div></div>
        <div className="session-form-grid">
          <label>Жұмыс атауы<input value={title} onChange={e => setTitle(e.target.value)} minLength={3} maxLength={160} placeholder="Мысалы, базалық станцияға қызмет көрсету" required/></label>
          <label>Қызмет түрі<select value={activityTypeId} onChange={e => setActivityTypeId(e.target.value)}>{activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label className="full-field">Жұмыс мекенжайы / орны<input value={address} onChange={e => setAddress(e.target.value)} minLength={3} maxLength={500} placeholder="Нысан мекенжайы немесе координаттар сипаттамасы" required/></label>
          <label>Жоспарланған басталу уақыты<input type="datetime-local" value={startAt} onChange={e => setStartAt(e.target.value)} required/></label>
          <label>Жоспарланған аяқталу уақыты<input type="datetime-local" value={endAt} onChange={e => setEndAt(e.target.value)} required/></label>
          <label>Қауіпсіздікті растау аралығы<select value={interval} onChange={e => setInterval(e.target.value)}><option value="15">Әр 15 минут сайын</option><option value="30">Әр 30 минут сайын</option><option value="45">Әр 45 минут сайын</option><option value="60">Әр сағат сайын</option><option value="120">Әр 2 сағат сайын</option></select></label>
        </div>
        <div className="session-form-actions"><button type="button" className="secondary-btn" onClick={() => setShowForm(false)}>Болдырмау</button><button className="create-session-btn" disabled={saving}>{saving ? 'Сақталуда...' : 'Сессия құру'}</button></div>
      </form>}
      <div className="sessions-list-head"><div><h2>Менің жұмыс сапарларым</h2><p>Сіздің тіркелгіңізге тағайындалған сессиялар</p></div><button className="refresh-btn" onClick={() => void load()} aria-label="Жаңарту"><RefreshCw size={16}/></button></div>
      {loading ? <div className="sessions-empty">Жұмыс сессиялары жүктелуде...</div> : sessions.length === 0 ? <div className="sessions-empty"><div><ShieldCheck size={27}/></div><b>Әзірге жұмыс сессиялары жоқ</b><span>Нысанға бармас бұрын сессия құрыңыз.</span></div> : <div className="sessions-list">{sessions.map(session => <article className="session-card" key={session.id}>
        <div className="session-card-main"><div className="session-card-title"><div><h3>{session.title}</h3><span className={'session-status ' + session.status.toLowerCase()}>{session.status === 'PLANNED' ? 'Жоспарланған' : session.status === 'ACTIVE' ? 'Белсенді' : session.status === 'COMPLETED' ? 'Аяқталған' : session.status}</span></div></div><div className="session-meta"><span><MapPin size={14}/>{session.site_address}</span><span><Clock3 size={14}/>{formatDate(session.planned_start_at)} — {formatDate(session.planned_end_at)}</span><span><RefreshCw size={14}/>Check-in: {session.checkin_interval_minutes} мин.</span></div><small className="session-activity">{session.activity_name}</small></div>
        <div className="session-actions">
          {session.status === 'PLANNED' && <button className="create-session-btn" onClick={() => void runAction(session,'start')}>Жұмысты бастау</button>}
          {session.status === 'ACTIVE' && <><button className="safe-checkin-btn" onClick={() => void runAction(session,'checkin')}><CheckCircle2 size={16}/>Қауіпсіздігім расталды</button><button className="sos-btn" onClick={() => void runAction(session,'sos')}><Siren size={16}/>SOS</button><button className="hidden-sos-btn" aria-label="Жасырын SOS жіберу" title="Жасырын SOS" onClick={() => void runAction(session,'hidden-sos')}><ShieldAlert size={16}/></button><button className="secondary-btn" onClick={() => void runAction(session,'complete')}>Аяқтау</button></>}
        </div>
      </article>)}</div>}
      <p className="sessions-disclaimer"><AlertTriangle size={14}/> Қосымша арқылы SOS жіберу үшін интернет қажет. Бұл компания бекіткен шұғыл байланыс арналарының орнына жүрмейді.</p>
    </section>
  </main>;
}
