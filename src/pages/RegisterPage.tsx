import { useState } from 'react';
import { ArrowRight, CheckCircle2, LockKeyhole, Mail, Phone, ShieldCheck, UserRound, BriefcaseBusiness } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

const roleOptions = [
  { value: 'EMPLOYEE', label: 'Қызметкер' },
  { value: 'SUPERVISOR', label: 'Топ жетекшісі' },
  { value: 'DISPATCHER', label: 'Диспетчер' },
  { value: 'SAFETY_MANAGER', label: 'Қауіпсіздік маманы' },
];

export function RegisterPage(){
 const [fullName,setFullName]=useState('');
 const [email,setEmail]=useState('');
 const [phone,setPhone]=useState('');
 const [role,setRole]=useState('EMPLOYEE');
 const [password,setPassword]=useState('');
 const [confirm,setConfirm]=useState('');
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const [success,setSuccess]=useState(false);

 async function submit(e:React.FormEvent){
  e.preventDefault();setError('');
  if(password!==confirm){setError('Құпиясөздер сәйкес келмейді');return;}
  if(password.length<12){setError('Құпиясөз кемінде 12 таңбадан тұруы керек');return;}
  setLoading(true);
  try{
   await api('/auth/register',{method:'POST',body:JSON.stringify({fullName,email,phone,role,password})});
   setSuccess(true);
  }catch(e){setError(e instanceof Error?e.message:'Тіркелу мүмкін болмады');}
  finally{setLoading(false);}
 }

 return <main className="register-shell"><section className="register-card">
  <div className="register-brand"><span><ShieldCheck size={22}/></span><b>SAFEFIELD</b></div>
  {success?<div className="register-state success"><CheckCircle2 size={34}/><h1>Тіркелу аяқталды!</h1><p>Тіркелгіңіз жасалды. Енді таңдалған рөлмен жүйеге кіре аласыз.</p><Link className="submit-button register-link" to="/login">Жүйеге кіру <ArrowRight size={17}/></Link></div>:<>
   <div className="form-heading"><span className="form-icon"><UserRound size={19}/></span><h1>Жаңа тіркелгі</h1><p>Уақытша ашық тіркелу режимі</p></div>
   <form onSubmit={submit} className="register-form">
    <label>Аты-жөні</label><div className="field"><UserRound size={16}/><input required minLength={2} maxLength={160} value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Аты-жөніңіз" autoComplete="name"/></div>
    <label>Жұмыс email</label><div className="field"><Mail size={16}/><input required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.kz" autoComplete="email"/></div>
    <label>Телефон нөмірі</label><div className="field"><Phone size={16}/><input type="tel" maxLength={40} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+7 7xx xxx xx xx" autoComplete="tel"/></div>
    <label>Рөліңіз</label><div className="field"><BriefcaseBusiness size={16}/><select required value={role} onChange={e=>setRole(e.target.value)}>{roleOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
    <label>Құпиясөз (кемінде 12 таңба)</label><div className="field"><LockKeyhole size={16}/><input required minLength={12} maxLength={128} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/></div>
    <label>Құпиясөзді қайталаңыз</label><div className="field"><LockKeyhole size={16}/><input required type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/></div>
    {error&&<div className="form-error" role="alert">{error}</div>}
    <button className="submit-button" disabled={loading}>{loading?'Тіркелуде…':'Тіркелу'} <ArrowRight size={17}/></button>
   </form>
   <p className="register-foot"><ShieldCheck size={14}/> Әкімші рөлі ашық тіркелуде қолжетімсіз. Рөлді кейін әкімші өзгерте алады.</p>
  </>}
 </section></main>;
}
