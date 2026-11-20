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
    if(password!==confirm){setError('Пароли не совпадают.');return;}
    if(password.length<12){setError('Пароль должен содержать не менее 12 символов.');return;}
    if(bootstrapSecret.length<32){setError('Проверьте секрет первого запуска: минимум 32 символа.');return;}
    setLoading(true);
    try {
      await api('/auth/bootstrap',{method:'POST',headers:{'x-bootstrap-secret':bootstrapSecret},body:JSON.stringify({fullName,email,password})});
      setSuccess(true);setPassword('');setConfirm('');setBootstrapSecret('');
    } catch(e) { setError(e instanceof Error ? e.message : 'Не удалось создать администратора.'); }
    finally { setLoading(false); }
  }

  return <main className="setup-shell">
    <header className="setup-top"><Link to="/login"><ArrowLeft size={17}/> Ко входу</Link><div className="sessions-brand"><ShieldCheck size={20}/> SAFEFlELD</div></header>
    <section className="setup-card">
      <div className="setup-icon"><UserPlus size={22}/></div>
      {success ? <>
        <div className="eyebrow light">INITIAL SETUP COMPLETE</div><h1>Администратор создан</h1>
        <p>Первичная настройка учётной записи завершена. Теперь можно войти в систему.</p>
        <Link className="create-session-btn setup-submit" to="/login">Перейти ко входу</Link>
      </> : <>
        <div className="eyebrow light">ONE-TIME ADMIN SETUP</div><h1>Первый администратор</h1>
        <p>Создайте главную учётную запись SAFEFIELD. Эта форма сработает только один раз.</p>
        <form onSubmit={submit} className="setup-form">
          <label>ФИО<input value={fullName} onChange={e=>setFullName(e.target.value)} minLength={2} maxLength={160} placeholder="Имя и фамилия" autoComplete="name" required/></label>
          <label>Рабочая почта<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@company.kz" autoComplete="email" required/></label>
          <label>Пароль администратора<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={12} maxLength={128} autoComplete="new-password" placeholder="Не менее 12 символов" required/></label>
          <label>Повторите пароль<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" required/></label>
          <label className="secret-field"><span><KeyRound size={14}/> Секрет первичной настройки</span><input type="password" value={bootstrapSecret} onChange={e=>setBootstrapSecret(e.target.value)} autoComplete="off" placeholder="Вставьте BOOTSTRAP_SECRET" required/></label>
          {error&&<div className="form-error" role="alert">{error}</div>}
          <button className="submit-button" disabled={loading}>{loading?'Создание...':'Создать администратора'}</button>
        </form>
        <div className="setup-note">После создания первой учётной записи endpoint первичной настройки будет закрыт. Удалите BOOTSTRAP_SECRET из настроек Pages.</div>
      </>}
    </section>
  </main>;
}
