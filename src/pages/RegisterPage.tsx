import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, LockKeyhole, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';

type PublicRole = 'EMPLOYEE' | 'SUPERVISOR' | 'DISPATCHER' | 'SAFETY_MANAGER';
const roleLabels: Record<PublicRole,string> = {
  EMPLOYEE: 'Қызметкер',
  SUPERVISOR: 'Топ жетекшісі',
  DISPATCHER: 'Диспетчер',
  SAFETY_MANAGER: 'Қауіпсіздік маманы',
};

export function RegisterPage(){
 const [params]=useSearchParams();const token=params.get('token')||'';
 const [fullName,setFullName]=useState('');const [phone,setPhone]=useState('');const [email,setEmail]=useState('');const [role,setRole]=useState<PublicRole>('EMPLOYEE');const [password,setPassword]=useState('');const [confirm,setConfirm]=useState('');const [error,setError]=useState('');const [loading,setLoading]=useState(false);const [success,setSuccess]=useState(false);
 const [registrationEnabled,setRegistrationEnabled]=useState(false);const [successMessage,setSuccessMessage]=useState('Тіркелгіңіз жасалды. Енді SafeField жүйесіне кіре аласыз.');const [checkingStatus,setCheckingStatus]=useState(!token);
 useEffect(()=>{if(token)return;api<{enabled:boolean}>('/auth/registration-status').then(result=>setRegistrationEnabled(result.enabled)).catch(()=>setRegistrationEnabled(false)).finally(()=>setCheckingStatus(false));},[token]);
 async function submit(e:React.FormEvent){
  e.preventDefault();setError('');
  if(password!==confirm){setError('Құпиясөздер сәйкес келмейді');return;}
  if(password.length<12){setError('Құпиясөз кемінде 12 таңбадан тұруы керек');return;}
  setLoading(true);
  try{
   if(token){await api('/invitations/accept',{method:'POST',body:JSON.stringify({token,fullName,phone,password})});}
   else{const result=await api<{status:string;message:string}>('/auth/register',{method:'POST',body:JSON.stringify({email,fullName,phone,password,role})});setSuccessMessage(result.message);}
   setSuccess(true);
  }catch(e){setError(e instanceof Error?e.message:'Тіркелу мүмкін болмады');}
  finally{setLoading(false);}
 }
 const publicMode=!token&&registrationEnabled;
 return <main className="register-shell"><section className="register-card"><div className="register-brand"><span><ShieldCheck size={22}/></span><b>SAFEFIELD</b></div>
 {success?<div className="register-state success"><CheckCircle2 size={34}/><h1>Тіркелу аяқталды!</h1><p>{successMessage}</p><Link className="submit-button register-link" to="/login">Жүйеге кіру <ArrowRight size={17}/></Link></div>
 :!token&&checkingStatus?<div className="register-state"><ShieldCheck size={28}/><h1>Тіркелу тексерілуде</h1><p>Бір сәт күтіңіз…</p></div>
 :!token&&!publicMode?<div className="register-state"><ShieldCheck size={28}/><h1>Тіркелу уақытша жабық</h1><p>Ашық тіркелу қазір қолжетімсіз. Әкімші немесе топ жетекшісі жіберген шақыру сілтемесін пайдаланыңыз.</p><Link className="submit-button register-link" to="/login">Жүйеге кіру <ArrowRight size={17}/></Link></div>
 :<><div className="form-heading"><span className="form-icon"><UserRound size={19}/></span><h1>{publicMode?'Жаңа тіркелгі жасау':'Қызметкер тіркелгісі'}</h1><p>{publicMode?'Уақытша ашық тіркелу · Әкімші рөлі берілмейді':'Шақыру арқылы жеке кабинетіңізді ашыңыз'}</p></div>
 <form onSubmit={submit} className="register-form">
 {publicMode&&<><label>Электрондық пошта</label><div className="field"><Mail size={16}/><input required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.kz" autoComplete="email"/></div><label>Рөліңіз</label><div className="field"><ShieldCheck size={16}/><select value={role} onChange={e=>setRole(e.target.value as PublicRole)}>{(Object.keys(roleLabels) as PublicRole[]).map(key=><option key={key} value={key}>{roleLabels[key]}</option>)}</select></div></>}
 <label>Аты-жөні</label><div className="field"><UserRound size={16}/><input required minLength={2} maxLength={160} value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Аты-жөніңіз" autoComplete="name"/></div>
 <label>Телефон нөмірі</label><div className="field"><Phone size={16}/><input type="tel" maxLength={40} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+7 7xx xxx xx xx" autoComplete="tel"/></div>
 <label>Құпиясөз (кемінде 12 таңба)</label><div className="field"><LockKeyhole size={16}/><input required minLength={12} maxLength={128} type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password"/></div>
 <label>Құпиясөзді қайталаңыз</label><div className="field"><LockKeyhole size={16}/><input required type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password"/></div>
 {error&&<div className="form-error" role="alert">{error}</div>}
 <button className="submit-button" disabled={loading}>{loading?'Тіркелуде…':'Тіркелуді аяқтау'} <ArrowRight size={17}/></button>
 </form>
 {publicMode&&<p className="register-foot"><ShieldCheck size={14}/> Әкімші рөлін тек қолданыстағы әкімші тағайындай алады.</p>}
 </>}
 </section></main>;
}
