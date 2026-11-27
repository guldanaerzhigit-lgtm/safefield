import { ArrowLeft, ArrowRight, Compass, Home, MapPin, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import './NotFoundPage.css';

export function NotFoundPage() {
  const token = useAuthStore(s => s.token);
  const homePath = token ? '/' : '/login';
  return <main className="sf404-page">
    <div className="sf404-glow sf404-glow-a"/><div className="sf404-glow sf404-glow-b"/>
    <header className="sf404-header"><Link to={homePath} className="sf404-brand"><span><ShieldCheck size={22}/></span><b>SAFEFIELD</b></Link><span className="sf404-status"><i/> Қауіпсіз жұмыс ортасы</span></header>
    <section className="sf404-content">
      <div className="sf404-orbit" aria-hidden="true"><div className="sf404-orbit-ring ring-a"/><div className="sf404-orbit-ring ring-b"/><div className="sf404-orbit-ring ring-c"/><div className="sf404-pin"><MapPin size={32}/></div><span className="sf404-coordinate">404 · NOT FOUND</span><span className="sf404-spark spark-a"/><span className="sf404-spark spark-b"/></div>
      <div className="sf404-copy"><div className="sf404-eyebrow"><Compass size={15}/> БАҒЫТ ТАБЫЛМАДЫ</div><h1>Бұл бет <em>табылмады.</em></h1><p>Іздеген парақшаңыз мекенжайын өзгерткен немесе жойылған болуы мүмкін. Уайымдамаңыз, SafeField жүйесіне қайта оралуға болады.</p><div className="sf404-actions"><Link className="sf404-primary" to={homePath}><Home size={17}/> Басты бетке қайту <ArrowRight size={16}/></Link><button className="sf404-back" onClick={()=>window.history.back()}><ArrowLeft size={16}/> Алдыңғы бет</button></div><small className="sf404-hint">Қате сілтеме ашылды ма? Мекенжайды тексеріп көріңіз.</small></div>
    </section>
    <footer className="sf404-footer"><span>© {new Date().getFullYear()} SAFEFIELD</span><span>Қауіпсіз жұмыс. Сенімді бақылау.</span></footer>
  </main>;
}
