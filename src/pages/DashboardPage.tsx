import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Bell, CalendarDays, ChevronRight, Clock3, Compass, ClipboardList, LogOut, Map, MapPin, Menu, RadioTower, Search, ShieldCheck, Siren, Users, X, BriefcaseBusiness, Settings, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import './dashboard-v2.css';

type Summary = { activeSessions: number; openAlerts: number; overdueCheckins: number; activeEmployees: number };
type SafetyAlert = { id: string; employee_name: string; alert_type: string; priority: string; status: string; message: string | null; created_at: string };
const roleName: Record<string,string> = { EMPLOYEE:'Қызметкер', SUPERVISOR:'Топ жетекшісі', DISPATCHER:'Диспетчер', SAFETY_MANAGER:'Қауіпсіздік менеджері', ADMIN:'Әкімші' };
const alertName: Record<string,string> = { SOS:'SOS дабылы', HIDDEN_SOS:'Жасырын SOS', MISSED_CHECKIN:'Check-in кешікті', RISK_ZONE:'Қауіпті аймақ', MANUAL:'Көмек сұрауы', SYSTEM:'Жүйелік дабыл' };
const formatTime = (value:string) => new Intl.DateTimeFormat('kk-KZ',{hour:'2-digit',minute:'2-digit'}).format(new Date(value));
export function DashboardPage() {
  const user = useAuthStore(s=>s.user); const logout = useAuthStore(s=>s.logout);
  const [summary,setSummary] = useState<Summary|null>(null); const [alerts,setAlerts] = useState<SafetyAlert[]>([]);
  const [error,setError] = useState(''); const [menuOpen,setMenuOpen] = useState(false); const [apiOnline,setApiOnline] = useState(false); const [query,setQuery] = useState('');
  const isEmployee = user?.role === 'EMPLOYEE';
  const canMonitor = ['ADMIN','SUPERVISOR','DISPATCHER','SAFETY_MANAGER'].includes(user?.role||'');
  const canAnalyze = ['ADMIN','SAFETY_MANAGER'].includes(user?.role||'');
  const load = useCallback(async()=>{
    setError('');
    const tasks = [api<{summary:Summary}>('/dashboard/summary').then(r=>setSummary(r.summary)).catch(e=>setError(e instanceof Error?e.message:'Көрсеткіштерді жүктеу мүмкін болмады')), api<{ok:boolean}>('/health').then(()=>setApiOnline(true)).catch(()=>setApiOnline(false))];
    if(canMonitor) tasks.push(api<{alerts:SafetyAlert[]}>('/alerts').then(r=>setAlerts(r.alerts.slice(0,5))).catch(()=>{}));
    await Promise.all(tasks);
  },[canMonitor]);
  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),30000);return()=>window.clearInterval(timer);},[load]);
  useEffect(()=>{if(!menuOpen)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenuOpen(false)};window.addEventListener('keydown',key);return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',key)}},[menuOpen]);
  const navItems = useMemo(()=>[
    {to:'/',label:'Басты бет',icon:Activity,show:true},
    {to:'/monitoring',label:'Карта (Live GPS)',icon:Map,show:canMonitor},
    {to:'/alerts',label:'SOS оқиғалары',icon:Siren,show:true},
    {to:'/team',label:'Қызметкерлер',icon:Users,show:['ADMIN','SUPERVISOR'].includes(user?.role||'')},
    {to:'/sessions',label:'Жұмыс сессиялары',icon:Compass,show:true},
    {to:'/work-orders',label:'Жұмыс тапсырмалары',icon:ClipboardList,show:true},
    {to:'/assets',label:'Нысандар каталогы',icon:BriefcaseBusiness,show:true},
    {to:'/analytics',label:'Есептер және аналитика',icon:BarChart3,show:canAnalyze},
    {to:'/notifications',label:'Хабарламалар',icon:Bell,show:true},
    {to:'/admin',label:'Параметрлер',icon:Settings,show:user?.role==='ADMIN'}
  ].filter(x=>x.show),[canAnalyze,canMonitor,user?.role]);
  const metrics = isEmployee ? [
    {label:'Менің жұмыс сессияларым',value:summary?.activeSessions,icon:Activity,tone:'blue',hint:'Белсенді жұмыс сессиялары'},
    {label:'Маған қатысты дабылдар',value:summary?.openAlerts,icon:AlertTriangle,tone:'red',hint:'Назар аударуды қажет етеді'},
    {label:'Растау күтілуде',value:summary?.overdueCheckins,icon:Clock3,tone:'orange',hint:'Уақытында растау'},
    {label:'Жүйе байланысы',value:apiOnline?'Онлайн':'Офлайн',icon:ShieldCheck,tone:'green',hint:'Қауіпсіз байланыс күйі'}
  ] : [
    {label:'Қызметкерлер',value:summary?.activeEmployees,icon:Users,tone:'green',hint:'Жалпы тіркелген қызметкерлер'},
    {label:'Белсенді қазір',value:summary?.activeSessions,icon:RadioTower,tone:'blue',hint:'Жұмыс істеп жатқан сессиялар'},
    {label:'SOS дабылдары',value:summary?.openAlerts,icon:Siren,tone:'red',hint:'Назар аударуды қажет етеді'},
    {label:'Кешіккен тексерулер',value:summary?.overdueCheckins,icon:Clock3,tone:'orange',hint:'Растау күтілуде'}
  ];
  const today = new Intl.DateTimeFormat('kk-KZ',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());
  const filteredNav = navItems.filter(x=>!query||x.label.toLowerCase().includes(query.toLowerCase()));
  return <div className="app-shell sf-v2" onContextMenu={e=>{if(!(e.target instanceof HTMLElement)||!e.target.closest('input,textarea,select,[contenteditable=true]'))e.preventDefault()}}>
    <button type="button" className={`sidebar-backdrop ${menuOpen?'visible':''}`} aria-label="Мәзірді жабу" aria-hidden={!menuOpen} tabIndex={menuOpen?0:-1} onClick={()=>setMenuOpen(false)}/>
    <aside id="primary-sidebar" className={`sidebar ${menuOpen?'sidebar-open':''}`}>
      <div className="sidebar-brand"><div className="brand-mark"><ShieldCheck size={22}/></div><div><b>SAFEFIELD</b><small>Қауіпсіз жұмыс ортасы</small></div><button type="button" className="close-menu" aria-label="Мәзірді жабу" onClick={()=>setMenuOpen(false)}><X size={18}/></button></div>
      <div className="workspace-label">БАСҚАРУ ОРТАЛЫҒЫ</div>
      <div className="sidebar-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Мәзірден іздеу"/></div>
      <nav>{filteredNav.map(item=>{const Icon=item.icon;return <Link key={item.to} to={item.to} onClick={()=>setMenuOpen(false)} className={`nav-item ${item.to==='/'?'selected':''}`}><Icon size={18}/>{item.label}{item.to==='/alerts'&&!!summary?.openAlerts&&<span className="nav-count">{summary.openAlerts}</span>}</Link>})}</nav>
      <div className="sidebar-bottom"><div className="sidebar-status"><span className={apiOnline?'status-dot':'status-dot offline'}/> Сервер байланысы <small>{apiOnline?'Қосылған':'Қолжетімсіз'}</small></div><div className="sidebar-user"><Link to="/profile" className="sidebar-user-profile" aria-label="Жеке профильді ашу"><div className="avatar">{user?.fullName?.slice(0,1)||'U'}</div><div><b>{user?.fullName||'Пайдаланушы'}</b><small>{roleName[user?.role||'EMPLOYEE']||'Қызметкер'}</small></div></Link><button title="Шығу" aria-label="Жүйеден шығу" onClick={logout}><LogOut size={17}/></button></div></div>
    </aside>
    <main className="main-area"><header className="topbar"><button type="button" className="menu-toggle" aria-label="Мәзірді ашу" aria-controls="primary-sidebar" aria-expanded={menuOpen} onClick={()=>setMenuOpen(true)}><Menu size={20}/></button><div className="breadcrumbs">SAFEFIELD <span>/</span> Басқару панелі</div><div className="topbar-actions"><span className="sf-header-date"><CalendarDays size={15}/>{today}</span><Link to="/notifications" className="icon-button" aria-label="Хабарландырулар"><Bell size={18}/>{!!summary?.openAlerts&&<i/>}</Link><span className="topbar-divider"/><Link to="/profile" className="profile-trigger"><span className="avatar small">{user?.fullName?.slice(0,1)||'U'}</span><span>{user?.fullName||'Пайдаланушы'}<small>{roleName[user?.role||'EMPLOYEE']||'Қызметкер'}</small></span></Link></div></header>
      <div className="page-content"><div className="sf-welcome"><div><div className="eyebrow light">ҚАУІПСІЗДІК ОПЕРАЦИЯЛАРЫ / LIVE</div><h1>Қош келдіңіз, {user?.fullName?.split(' ')[0]||'пайдаланушы'}!</h1><p>{isEmployee?'Жеке қауіпсіздік панеліңіз және жұмыс барысы.':'SafeField қауіпсіздік басқару панелі. Барлық маңызды көрсеткіш бір жерде.'}</p></div><div className="sf-live-chip"><span/> Нақты уақыттағы бақылау</div></div>
      {error&&<div className="api-warning"><AlertTriangle size={17}/><span>Көрсеткіштерді жүктеу мүмкін болмады: {error}. API байланысын тексеріңіз.</span></div>}
      <section className="metric-grid">{metrics.map(({label,value,icon:Icon,tone,hint})=><article className={`metric-card sf-metric ${tone}`} key={label}><div className="metric-icon"><Icon size={20}/></div><div className="metric-label">{label}</div><div className="metric-value">{value===undefined?'—':value}</div><div className="metric-hint">{hint}</div></article>)}</section>
      <section className="sf-main-grid"><article className="content-card sf-map-card"><div className="card-heading"><div><h2><MapPin size={17}/> {isEmployee?'Менің орналасқан жерім':'Қызметкерлер картасы (Live)'}</h2><p>{isEmployee?'Өз GPS ақпаратыңызды және жұмыс күйіңізді бақылаңыз.':'Қызметкерлердің соңғы GPS координаттары мен қауіпсіздік аймақтары'}</p></div><Link to={canMonitor?'/monitoring':'/profile'} className="sf-card-link">{canMonitor?'Картаны ашу':'Профиль'} <ChevronRight size={15}/></Link></div><div className="sf-map-preview"><div className="sf-map-grid"/><div className="sf-map-orbit orbit-one"/><div className="sf-map-orbit orbit-two"/><div className="sf-map-center"><MapPin size={25}/></div><div className="sf-map-label"><Map size={16}/><span>{canMonitor?'Live GPS мониторингі':'Жеке GPS бақылауы'}</span></div><div className="sf-map-legend"><span><i className="green-dot"/> Онлайн</span><span><i className="red-dot"/> SOS дабылы</span></div><Link to={canMonitor?'/monitoring':'/profile'} className="sf-map-open">Толық картаны ашу <ChevronRight size={15}/></Link></div></article>
        <article className="content-card sf-alert-card"><div className="card-heading"><div><h2><Siren size={17}/> SOS оқиғалары</h2><p>Соңғы тіркелген дабылдар</p></div><Link to="/alerts" className="sf-card-link">Барлығын көру <ChevronRight size={15}/></Link></div>{canMonitor?(alerts.length? <div className="sf-alert-list">{alerts.slice(0,4).map(a=><div className="sf-alert-row" key={a.id}><span className="sf-alert-icon"><Siren size={17}/></span><div className="sf-alert-info"><b>{alertName[a.alert_type]||a.alert_type}</b><small>{a.employee_name} · {formatTime(a.created_at)}</small></div><span className={`sf-alert-status ${a.status.toLowerCase()}`}>{a.status==='OPEN'?'Жаңа':a.status==='ACKNOWLEDGED'?'Қабылданды':a.status==='IN_PROGRESS'?'Орындалуда':'Жабық'}</span></div>)}</div>:<div className="sf-empty"><ShieldCheck size={25}/><b>Белсенді дабылдар жоқ</b><span>Жаңа SOS оқиғалары осы жерде көрсетіледі.</span></div>):<div className="sf-empty"><ShieldCheck size={25}/><b>Жеке қауіпсіздік</b><span>Көмек қажет болса, SafeField қолданбасындағы SOS батырмасын пайдаланыңыз.</span></div>}</article>
      </section>
      <section className="sf-lower-grid"><article className="content-card sf-activity-card"><div className="card-heading"><div><h2><Activity size={17}/> Қауіпсіздік көрсеткіштері</h2><p>Ағымдағы жүйелік жағдай</p></div><span className="sf-status-label"><i/> LIVE</span></div><div className="sf-health-list"><div><span>API сервері</span><b className={apiOnline?'ok':'bad'}>{apiOnline?'Қосылған':'Қолжетімсіз'}</b></div><div><span>Белсенді сессиялар</span><b>{summary?.activeSessions??'—'}</b></div><div><span>Уақытында расталмаған тексерулер</span><b>{summary?.overdueCheckins??'—'}</b></div><div><span>Ашық қауіпсіздік дабылдары</span><b className={summary?.openAlerts?'bad':''}>{summary?.openAlerts??'—'}</b></div></div></article>
        <article className="content-card sf-quick-card"><div className="card-heading"><div><h2><Compass size={17}/> Жылдам әрекеттер</h2><p>Негізгі бөлімдерге өту</p></div></div><div className="sf-quick-grid"><Link to="/sessions"><span><Activity size={18}/></span><b>Жұмыс сессиялары</b><ChevronRight size={15}/></Link><Link to="/alerts"><span className="red"><Siren size={18}/></span><b>SOS оқиғалары</b><ChevronRight size={15}/></Link>{canMonitor&&<Link to="/monitoring"><span><MapPin size={18}/></span><b>GPS мониторингі</b><ChevronRight size={15}/></Link>}<Link to="/notifications"><span><Bell size={18}/></span><b>Хабарламалар</b><ChevronRight size={15}/></Link></div></article>
      </section>
      <section className="sf-bottom-strip"><div className="sf-work-status"><span className="sf-work-icon"><BriefcaseBusiness size={22}/></span><div><b>Жұмыс мәртебесі</b><small>{summary?.activeSessions??'—'} белсенді сессия · {summary?.activeEmployees??'—'} қызметкер</small></div><Link to="/sessions">Толығырақ <ChevronRight size={15}/></Link></div><div className="sf-today"><CalendarDays size={22}/><div><b>Бүгінгі күн</b><small>{today}</small></div></div></section>
      <footer className="dashboard-footer"><span>SAFEFIELD Enterprise · Қауіпсіз жұмыс ортасы</span><span>Деректер пайдаланушы рөліне сәйкес көрсетіледі</span></footer></div></main>
  </div>;
}
