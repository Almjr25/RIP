// Vercel Node function. Only the public Supabase key is used; RLS applies to every request.
const {randomBytes}=require('node:crypto');
require('../web/receipt.js');
const fiscal=require('../web/fiscal.js');
const validation=require('../web/validation.js');
const COOKIE='__Host-rip_';
function config(){
 const url=process.env.SUPABASE_URL?.trim().replace(/\/+$/,'');
 const key=process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
 const origin=process.env.RIP_APP_ORIGIN?.trim().replace(/\/+$/,'');
 if(!url||!key||!origin)throw Object.assign(Error('A conexão com o banco ainda não foi configurada na Vercel.'),{status:503});
 if(!key.startsWith('sb_publishable_'))throw Object.assign(Error('Configure a chave publishable do Supabase, nunca uma chave secreta.'),{status:503});
 if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)||!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/.test(origin))throw Object.assign(Error('A conexão está com um endereço inválido na configuração do aplicativo.'),{status:503});
 return {url,key,origin};
}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').filter(x=>x.includes('=')).map(x=>{const n=x.indexOf('=');return [x.slice(0,n).trim(),x.slice(n+1)]}))}
function setSession(res,s){
 const attrs='; Path=/; HttpOnly; Secure; SameSite=Lax';
 res.setHeader('Set-Cookie',[
  `${COOKIE}access=${s?.access_token||''}; Max-Age=${s?604800:0}${attrs}`,
  `${COOKIE}refresh=${s?.refresh_token||''}; Max-Age=${s?604800:0}${attrs}`
 ]);
}
function fail(message,status=400){throw Object.assign(Error(message),{status})}
async function request(c,path,{method='GET',body,token}={}){
 let r;try{r=await fetch(c.url+path,{method,headers:{apikey:c.key,...(token?{Authorization:'Bearer '+token}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)})}catch{fail('Não foi possível conectar ao banco. Tente novamente.',503)}
 const value=await r.json().catch(()=>null);
 if(!r.ok){
  let message='Não foi possível concluir a operação.';
  if(value?.code==='23505')message='Já existe uma compra com esta chave fiscal na sua conta.';
  else if(value?.code==='P0001')message=value.message;
  else if(r.status===429)message='Muitas tentativas. Aguarde antes de tentar novamente.';
  else if(path.startsWith('/auth/')){
   const messages={invalid_credentials:'E-mail ou senha incorretos.',email_not_confirmed:'Confirme seu e-mail antes de entrar.',weak_password:'Use uma senha mais forte.',same_password:'Escolha uma senha diferente da atual.',over_email_send_rate_limit:'Aguarde antes de pedir outro e-mail.',user_already_exists:'Não foi possível criar a conta. Tente entrar ou recuperar a senha.',signup_disabled:'A criação de contas ainda não foi habilitada pelo responsável pelo aplicativo.',email_provider_disabled:'O login por e-mail ainda não foi habilitado pelo responsável pelo aplicativo.',email_address_not_authorized:'O envio de e-mails deste projeto ainda está restrito. O responsável pelo aplicativo precisa liberar o serviço de e-mail.',email_address_invalid:'Este endereço de e-mail não foi aceito. Confira o endereço e tente novamente.'};
   message=messages[value?.error_code||value?.code]||(r.status>=500?'O serviço de autenticação está indisponível ou não conseguiu enviar o e-mail. Tente novamente mais tarde.':'Não foi possível autenticar. Confira os dados ou solicite outro link.');
   if(value?.message==='Invalid API key')message='A chave de conexão do aplicativo é inválida. A configuração precisa ser corrigida pelo responsável.';
  }
  else if(value?.code==='PGRST202'||value?.code==='42P01')message='O banco ainda precisa receber o SQL de instalação do RIP.';
  fail(message,r.status===429?429:r.status>=500?503:400);
 }
 return value;
}
async function session(req,res,c){
 const jar=cookies(req);let token=jar[COOKIE+'access'];
 if(!token&&!jar[COOKIE+'refresh'])fail('Entre na sua conta para continuar.',401);
 if(token){
  const r=await fetch(c.url+'/auth/v1/user',{headers:{apikey:c.key,Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});
  if(r.ok)return {token,user:await r.json()};
  if(r.status!==401&&r.status!==403)fail('Não foi possível verificar a sessão. Tente novamente.',503);
 }
 if(!jar[COOKIE+'refresh']){setSession(res,null);fail('Sua sessão expirou. Entre novamente.',401)}
 let s;try{s=await request(c,'/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:jar[COOKIE+'refresh']}})}catch(e){if(e.status!==503&&e.status!==429){setSession(res,null);e.status=401}throw e}
 setSession(res,s);return {token:s.access_token,user:s.user};
}
function credentials(body){
 if(typeof body.email!=='string'||body.email.length>254||!/^\S+@\S+\.\S+$/.test(body.email))fail('Informe um e-mail válido.');
 if(typeof body.password!=='string'||body.password.length<8||body.password.length>128)fail('Use uma senha entre 8 e 128 caracteres.');
 return {email:body.email.trim(),password:body.password};
}
function validateBody(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||!Array.isArray(p.items)||p.items.length>2000||!['draft','confirmed'].includes(p.status))fail('Compra inválida.');
 if(p.id&&!/^[a-f0-9]{32}$/.test(p.id))fail('Identificação da compra inválida.');
 if(p.items.some(i=>!i||typeof i!=='object'||Array.isArray(i)))fail('Item inválido.');
 p.key=fiscal.normalize(p.key);
 if(p.status==='confirmed'){
  const r=validation.validate(p);if(!r.ready)fail(r.issues.map(i=>i.message).join(' '));
 }
 p.id=p.id||randomBytes(16).toString('hex');
 delete p.owner_id;delete p.user_id;
 p.fiscalValidation={keyStatus:fiscal.inspect(p.key).valid?'valid_format':p.key?'invalid':'missing',authenticity:'not_checked'};
 return p;
}
async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Vary','Cookie');res.setHeader('X-Content-Type-Options','nosniff');
 try{
  const c=config(),path=new URL(req.url,'https://rip.invalid').pathname,method=req.method;
  if(!['GET','POST'].includes(method))fail('Método não permitido.',405);
  if(method==='POST'&&req.headers.origin!==c.origin)fail('Origem da requisição não permitida.',403);
  if(method==='POST'&&!String(req.headers['content-type']||'').startsWith('application/json'))fail('Envie dados em JSON.',415);
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
  if(Buffer.byteLength(JSON.stringify(body))>1500000)fail('Esta compra excede o limite de 1,5 MB. Exporte um backup dos anexos antigos.',413);
  let result;
  if(method==='POST'&&path==='/api/auth/login'){
   const s=await request(c,'/auth/v1/token?grant_type=password',{method:'POST',body:credentials(body)});setSession(res,s);result={user:{id:s.user.id,email:s.user.email}};
  }else if(method==='POST'&&path==='/api/auth/signup'){
   await request(c,'/auth/v1/signup?redirect_to='+encodeURIComponent(c.origin),{method:'POST',body:credentials(body)});result={message:'Confira seu e-mail para confirmar a conta. Se já tiver uma conta, entre ou recupere a senha.'};
  }else if(method==='POST'&&path==='/api/auth/recover'){
   if(typeof body.email!=='string'||!/^\S+@\S+\.\S+$/.test(body.email)||body.email.length>254)fail('Informe um e-mail válido.');
   await request(c,'/auth/v1/recover?redirect_to='+encodeURIComponent(c.origin),{method:'POST',body:{email:body.email.trim()}});result={message:'Se houver uma conta com esse e-mail, você receberá o link de recuperação.'};
  }else if(method==='POST'&&path==='/api/auth/session'){
   if(typeof body.access_token!=='string'||typeof body.refresh_token!=='string'||body.access_token.length>8000||body.refresh_token.length>1000||!/^[-\w.]+$/.test(body.access_token)||!/^[-\w.]+$/.test(body.refresh_token))fail('Link de acesso inválido. Solicite outro.');
   const user=await request(c,'/auth/v1/user',{token:body.access_token});
   setSession(res,body);result={user:{id:user.id,email:user.email}};
  }else{
   const s=await session(req,res,c);
   if((path.startsWith('/api/purchases')||path==='/api/stats'||path==='/api/auth/password'||path==='/api/auth/logout')&&req.headers['x-rip-account']!==s.user.id)fail('A conta mudou em outra aba. Entre novamente para atualizar esta página.',401);
   if(method==='GET'&&path==='/api/auth/status')result={user:{id:s.user.id,email:s.user.email}};
   else if(method==='POST'&&path==='/api/auth/logout'){
    await request(c,'/auth/v1/logout?scope=local',{method:'POST',token:s.token});setSession(res,null);result={ok:true};
   }else if(method==='POST'&&path==='/api/auth/password'){
    if(typeof body.password!=='string'||body.password.length<8||body.password.length>128)fail('Use uma senha entre 8 e 128 caracteres.');
    await request(c,'/auth/v1/user',{method:'PUT',body:{password:body.password},token:s.token});result={ok:true};
   }else if(method==='GET'&&path==='/api/purchases'){
    const search=new URL(req.url,c.origin).searchParams;
    if(search.has('id')){
     const id=search.get('id');if(!/^[a-f0-9]{32}$/.test(id))fail('Identificação inválida.');
     const rows=await request(c,'/rest/v1/purchases?select=id,data,revision,updated_at&id=eq.'+id,{token:s.token});
     if(!rows.length)fail('Compra não encontrada.',404);
     const items=[];
     while(items.length<rows[0].data.itemCount){
      const page=await request(c,'/rest/v1/purchase_items?select=data&purchase_id=eq.'+id+'&order=position.asc&limit=500&offset='+items.length,{token:s.token});
      if(!page.length)break;items.push(...page);
     }
     if(items.length!==rows[0].data.itemCount)fail('Não foi possível carregar todos os itens. Atualize o histórico.',503);
     result={...rows[0].data,id:rows[0].id,items:items.map(x=>x.data),_revision:rows[0].revision,updated:rows[0].updated_at};
    }else{
     const offset=Number(search.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0)fail('Página inválida.');
     const rows=await request(c,'/rest/v1/purchases?select=id,status,store,purchase_date,fiscal_key,receipt_total_cents,item_count,revision,updated_at&order=updated_at.desc,id.asc&limit=30&offset='+offset,{token:s.token});
     result={rows:rows.map(r=>({id:r.id,status:r.status,store:r.store,date:r.purchase_date,key:r.fiscal_key,receiptTotal:r.receipt_total_cents==null?'':(r.receipt_total_cents/100).toFixed(2),items:[],itemCount:r.item_count,_revision:r.revision,_summary:true,updated:r.updated_at})),hasMore:rows.length===30};
    }
   }else if(method==='GET'&&path==='/api/stats')result=await request(c,'/rest/v1/rpc/rip_stats',{method:'POST',body:{},token:s.token});
   else if(method==='POST'&&path==='/api/purchases'){
    const p=validateBody(body);
    result=await request(c,'/rest/v1/rpc/rip_save_purchase',{method:'POST',body:{payload:p,expected_revision:p._revision??null},token:s.token});
    result={...p,...result};
   }else if(method==='POST'&&path==='/api/purchases/delete'){
    if(!/^[a-f0-9]{32}$/.test(body.id||''))fail('Identificação inválida.');
    result=await request(c,'/rest/v1/rpc/rip_delete_purchase',{method:'POST',body:{purchase_id:body.id,expected_revision:body._revision??null},token:s.token});
   }else fail('Operação não encontrada.',404);
  }
  res.status(200).json(result);
 }catch(e){res.status(e.status||500).json({error:e.status?e.message:'Não foi possível concluir. Tente novamente.'})}
}
module.exports=handler;
module.exports.validateBody=validateBody;
