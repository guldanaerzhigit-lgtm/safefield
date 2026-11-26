import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Activity, AlertTriangle, BarChart3, Bell, Building2, ClipboardList, Compass, MapPin, Menu, Siren, QrCode, RadioTower, ShieldCheck, Users, UserPlus, X } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

const items = [
  { to: '/', label: 'Шолу', icon: Activity },
  { to: '/notifications', label: 'Хабарландырулар', icon: Bell },
  { to: '/sessions', label: 'Жұмыс сессиялары', icon: Compass },
  { to: '/work-orders', label: 'Жұмыс тапсырмалары', icon: ClipboardList },
  { to: '/assets', label: 'Нысандар каталогы', icon: QrCode },
  { to: '/alerts', label: 'Дабылдар орталығы', icon: AlertTriangle },
  { to: '/incidents', label: 'Оқиғалар мен қауіптер', icon: Siren },
  { to: '/geofence', label: 'Smart Geofence', icon: RadioTower },
];

export function SectionNavigation() {
  const user = useAuthStore(s => s.user);
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const role = user?.role || '';
  const visible = [
    ...items,
    ...(['SUPERVISOR','ADMIN'].includes(role) ? [{ to: '/team', label: 'Менің тобым', icon: Users }] : []),
    ...(['SUPERVISOR','DISPATCHER','SAFETY_MANAGER','ADMIN'].includes(role) ? [
      { to: '/monitoring', label: 'Қызметкерлер картасы', icon: MapPin },
      { to: '/dispatch', label: 'Диспетчерлік бақылау', icon: AlertTriangle },
    ] : []),
    ...(['SAFETY_MANAGER','ADMIN'].includes(role) ? [
      { to: '/zones', label: 'Қауіпсіздік аймақтары', icon: ShieldCheck },
      { to: '/analytics', label: 'Қауіпсіздік аналитикасы', icon: BarChart3 },
    ] : []),
    ...(['SUPERVISOR','ADMIN'].includes(role) ? [{ to: '/invitations', label: 'Қызметкер шақыру', icon: UserPlus }] : []),
    ...(role === 'ADMIN' ? [{ to: '/admin', label: 'Әкімшілендіру', icon: Building2 }] : []),
    { to: '/profile', label: 'Жеке профиль', icon: Users },
  ];
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return <>
    <button className="section-menu-fab" type="button" aria-label="Бөлімдер мәзірін ашу" aria-expanded={open} onClick={() => setOpen(true)}><Menu size={21}/><span>Бөлімдер</span></button>
    {open && <div className="section-menu-layer">
      <button className="section-menu-scrim" aria-label="Мәзірді жабу" onClick={() => setOpen(false)}/>
      <aside className="section-menu-panel" aria-label="Сайт бөлімдері">
        <div className="section-menu-head"><div><b>SAFEFIELD</b><small>БӨЛІМДЕР</small></div><button type="button" aria-label="Жабу" onClick={() => setOpen(false)}><X size={20}/></button></div>
        <nav>{visible.map(({to,label,icon:Icon}) => <NavLink key={to} to={to} end={to==='/'} className={({isActive}) => 'section-menu-link'+(isActive?' active':'')}><Icon size={18}/><span>{label}</span></NavLink>)}</nav>
      </aside>
    </div>}
  </>;
}
