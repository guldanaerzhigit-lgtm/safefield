const enc = new TextEncoder();
const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const unb64u = (value: string) => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4)), c=>c.charCodeAt(0));
const asBuffer = (bytes: Uint8Array): ArrayBuffer => { const copy=new Uint8Array(bytes.length);copy.set(bytes);return copy.buffer; };
const concat = (...parts: Uint8Array[]) => { const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out; };
async function hmac(key: Uint8Array, data: Uint8Array) { const k=await crypto.subtle.importKey('raw',asBuffer(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,asBuffer(data))); }
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number) { let t=new Uint8Array(),out=new Uint8Array();for(let i=1;out.length<length;i++){t=await hmac(prk,concat(t,info,new Uint8Array([i])));out=concat(out,t);}return out.slice(0,length); }
async function hkdfExtract(salt: Uint8Array, ikm: Uint8Array) { return hmac(salt.length?salt:new Uint8Array(32),ikm); }
async function vapidToken(endpoint: string, env: {VAPID_PRIVATE_KEY:string;VAPID_PUBLIC_KEY:string;VAPID_SUBJECT:string}) {
 const audience=new URL(endpoint).origin;const now=Math.floor(Date.now()/1000);
 const header=b64u(enc.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
 const payload=b64u(enc.encode(JSON.stringify({aud:audience,exp:now+12*60*60,sub:env.VAPID_SUBJECT})));
 const input=enc.encode(header+'.'+payload);
 const key=await crypto.subtle.importKey('pkcs8',asBuffer(unb64u(env.VAPID_PRIVATE_KEY)),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,asBuffer(input)));
 return header+'.'+payload+'.'+b64u(signature);
}
export async function sendWebPush(subscription:{endpoint:string;p256dh:string;auth:string}, payload:unknown, env:{VAPID_PRIVATE_KEY:string;VAPID_PUBLIC_KEY:string;VAPID_SUBJECT:string}) {
 const clientPublic=unb64u(subscription.p256dh),authSecret=unb64u(subscription.auth);
 if(clientPublic.length!==65||authSecret.length!==16)throw new Error('Push жазылымының кілттері жарамсыз');
 const receiver=await crypto.subtle.importKey('raw',asBuffer(clientPublic),{name:'ECDH',namedCurve:'P-256'},false,[]);
 const ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']) as CryptoKeyPair;
 const serverPublic=new Uint8Array(await crypto.subtle.exportKey('raw',ephemeral.publicKey));
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',$public:receiver},ephemeral.privateKey,256));
 const authPrk=await hkdfExtract(authSecret,shared);
 const keyInfo=concat(enc.encode('WebPush: info\0'),clientPublic,serverPublic);
 const ikm=await hkdfExpand(authPrk,keyInfo,32);
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const prk=await hkdfExtract(salt,ikm);
 const cek=await hkdfExpand(prk,enc.encode('Content-Encoding: aes128gcm\0'),16);
 const nonce=await hkdfExpand(prk,enc.encode('Content-Encoding: nonce\0'),12);
 const plain=concat(enc.encode(JSON.stringify(payload)),new Uint8Array([2]));
 const aes=await crypto.subtle.importKey('raw',asBuffer(cek),{name:'AES-GCM'},false,['encrypt']);
 const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:asBuffer(nonce),tagLength:128},aes,asBuffer(plain)));
 const rs=new Uint8Array([0,0,16,0]);
 const body=concat(salt,rs,new Uint8Array([serverPublic.length]),serverPublic,cipher);
 const token=await vapidToken(subscription.endpoint,env);
 const response=await fetch(subscription.endpoint,{method:'POST',headers:{Authorization:'vapid t='+token+', k='+env.VAPID_PUBLIC_KEY,'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream','TTL':'86400','Urgency':'high'},body:asBuffer(body)});
 if(!response.ok)throw new Error('Push жеткізушісі жауап берді: HTTP '+response.status);
 return response.status;
}
