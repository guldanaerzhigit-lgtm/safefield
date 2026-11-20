import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, KeyRound, ShieldCheck, UserPlus } from 'lucide-react';
import { api } from '../services/api';

export function SetupPage() {
  const [fullName,setFullName]=useState('');
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [bootstrapSecret,setBootstrapSecret]=useState('');
  const [error,setError]=useState('');
  const [success,setSuccess]=useState(false);
  const [loading,setLoading]=useState(false);

  async function submit(event:React.FormEvent) {
    event.preventDefault(); setError('');
    if(password!==confirm){setError('Құпиясөздер сәйкес келмейді.');return;}
    if(password.length<12){setError('Құпиясөз кемінде 12 таңбадан тұруы керек.');return;}
    if(bootstrapSecret.length<32){setError('Алғашқы іске қосу кілтін тексеріңіз: кемінде 32 таңба.');return;}
    setLoading(true);
    try {
      await api('/auth/bootstrap',{method:'POST',headers:{'x-bootstrap-secret':bootstrapSecret},body:JSON.stringify({fullName,email,password})});
      setSuccess(true);setPassword('');setConfirm('');setBootstrapSecret('');
    } catch(e) { setError(e instanceof Error ? e.message : 'Әкімшіні құру мүмкін болмады.'); }
    finally { setLoading(false); }
  }

  return <main className="setup-shell">
    <header className="setup-top"><Link to="/login"><ArrowLeft size={17}/> Кіру бетіне</Link><div className="sessions-brand"><ShieldCheck size={20}/> SAFEFIELD</div></header>
    <section className="setup-card">
      <div className="setup-icon"><UserPlus size={22}/></div>
      {success ? <>
        <div className="eyebrow light">БАСТАПҚЫ БАПТАУ АЯҚТАЛДЫ</div><h1>Әкімші құрылды</h1>
        <p>Тіркелгіні бастапқы баптау аяқталды. Енді жүйеге кіруге болады.</p>
        <Link className="create-session-btn setup-submit" to="/login">Жүйеге кіру</Link>
      </> : <>
        <div className="eyebrow light">ӘКІМШІНІ БІР РЕТТІК БАПТАУ</div><h1>Алғашқы әкімші</h1>
        <p>SAFEFIELD жүйесінің негізгі әкімші тіркелгісін жасаңыз. Бұл пішін тек бір рет қолданылады.</p>
        <form onSubmit={submit} className="setup-form">
          <label>Аты-жөні<input value={fullName} onChange={e=>setFullName(e.target.value)} minLength={2} maxLength={160} placeholder="Аты және тегі" autoComplete="name" required/></label>
          <label>Жұмыс поштасы<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@company.kz" autoComplete="email" required/></label>
          <label>Әкімші құпиясөзі<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={12} maxLength={128} autoComplete="new-password" placeholder="Кемінде 12 таңба" required/></label>
          <label>Құпиясөзді қайталаңыз<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" required/></label>
          <label className="secret-field"><span><KeyRound size={14}/> Бастапқы баптау кілті</span><input type="password" value={bootstrapSecret} onChange={e=>setBootstrapSecret(e.target.value)} autoComplete="off" placeholder="BOOTSTRAP_SECRET мәнін енгізіңіз" required/></label>
          {error&&<div className="form-error" role="alert">{error}</div>}
          <button className="submit-button" disabled={loading}>{loading?'Құрылуда...':'Әкімшіні құру'}</button>
        </form>
        <div className="setup-note">Алғашқы тіркелгі жасалғаннан кейін бастапқы баптау нүктесі жабылады. Pages баптауларынан BOOTSTRAP_SECRET мәнін алып тастаңыз.</div>
      </>}
    </section>
  </main>;
}
