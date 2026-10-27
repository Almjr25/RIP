// Same-origin API; session tokens stay in HttpOnly cookies, never localStorage.
window.RIPCloud=true;
let cloudUser=null,cloudOffset=0,cloudStats=null,cloudMore=false,cloudWorking=false;
async function cloudRequest(path,body){
 const account=cloudUser?.id,protectedRoute=/^\/api\/(purchases|stats|auth\/(password|logout))/.test(path);
 const headers={...(account?{'X-RIP-Account':account}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})};
 const response=await fetch(path,body===undefined?{cache:'no-store',headers}:{method:'POST',headers,body:JSON.stringify(body)});
 const value=await response.json().catch(()=>({error:'Resposta inesperada do servidor.'}));
 if(!response.ok){if(response.status===401)lockCloud();throw Error(value.error||'Não foi possível concluir.')}
 if(protectedRoute&&account!==cloudUser?.id)throw Error('A conta mudou. Atualize a página.');
 return value;
}
async function cloudAPI(path,body){
 if(!cloudUser)throw Error('Entre na sua conta para acessar as compras.');
 if(path==='/api/purchases'&&body===undefined){
  const [page,stats]=await Promise.all([cloudRequest('/api/purchases?offset=0'),cloudRequest('/api/stats')]);
  cloudOffset=page.rows.length;cloudMore=page.hasMore;cloudStats=stats;return page.rows;
 }
 if(path==='/api/purchases/delete')return cloudRequest(path,{...body,_revision:purchase?._revision});
 return cloudRequest(path,body);
}
function cloudMessage(message,error=false){$('accountMessage').textContent=message;$('accountMessage').className=error?'error':'hint'}
function lockCloud(){
 cloudUser=null;cloudStats=null;purchases=[];purchase=null;dirty=false;
 document.body.classList.add('cloud-locked');$('authForm').hidden=false;$('accountTools').hidden=true;
 $('accountEmail').textContent='Entre para acessar seus cupons';$('passwordForm').hidden=true;
 $('authPassword').value='';$('newPassword').value='';
 $('purchaseList').replaceChildren();$('receiptText').value='';$('items').replaceChildren();
 for(const id of ['store','cnpj','date','key','discount','extra','receiptTotal'])$(id).value='';
 $('navNew').disabled=true;$('navPurchases').disabled=true;
}
async function unlockCloud(user){
 cloudUser=user;document.body.classList.remove('cloud-locked');$('authForm').hidden=true;$('accountTools').hidden=false;
 $('accountEmail').textContent=user.email;$('navNew').disabled=false;$('navPurchases').disabled=false;
 await list();const local=await readAll('purchases');$('migrateLocal').hidden=!local.length;
 $('exportLocalBackup').hidden=!local.length;
 $('migrateLocal').textContent=`Copiar ${local.length} compras deste navegador para a conta`;
}
function decorateCloudList(){
 if(!cloudUser)return;
 if(cloudStats){$('count').textContent=cloudStats.count;$('pending').textContent=cloudStats.pending;$('sum').textContent=money(Number(cloudStats.totalCents))}
 $('historyCount').textContent=`${purchases.length} compras exibidas`;
 $('loadMore').hidden=!cloudMore;
 document.querySelectorAll('[data-open]').forEach(button=>button.onclick=async()=>{
  if(busy)return;busy=true;
  try{const p=await cloudRequest('/api/purchases?id='+button.dataset.open);if(cloudUser)edit(p)}catch(e){notify(e.message,true)}finally{busy=false}
 });
}
async function cloudAll(){
 const result=[];let offset=0,more=true;
 while(more){const page=await cloudRequest('/api/purchases?offset='+offset);result.push(...page.rows);offset+=page.rows.length;more=page.hasMore}
 return result;
}
async function migrateCloud(input){
 if(cloudWorking||busy)return;
 const data=input||await readAll('purchases');
 if(!data.length){cloudMessage('Não há compras locais para copiar.');return}
 if(!confirm(`Copiar ${data.length} compras para ${cloudUser.email}? Os originais locais serão mantidos. Anexos antigos ficam apenas no backup local. Compras antigas com pendências serão copiadas como rascunhos. Notas já existentes na conta não serão substituídas.`))return;
 cloudWorking=true;$('migrateLocal').disabled=true;
 let saved=0,skipped=0,drafts=0;const failures=[];
 try{
  const existing=await cloudAll(),ids=new Set(existing.map(p=>p.id)),keys=new Set(existing.map(p=>p.key).filter(Boolean));
  for(const source of data){
   if(!cloudUser)break;
   if(ids.has(source.id)||(source.key&&keys.has(ReceiptFiscal.normalize(source.key)))){skipped++;continue}
   const p=structuredClone(source);delete p._revision;delete p._summary;p.images=[];
   // Copies old annotations/history, but never claims official fiscal authentication.
   if(p.status==='confirmed'&&!ReceiptValidation.validate(p).ready){p.legacyStatus='confirmed';p.status='draft';drafts++}
   try{await cloudRequest('/api/purchases',p);saved++;ids.add(p.id);if(p.key)keys.add(ReceiptFiscal.normalize(p.key))}
   catch(e){failures.push((p.store||'Compra')+': '+e.message);if(!cloudUser)break}
   cloudMessage(`Copiando: ${saved} salvas, ${skipped} já existentes, ${failures.length} pendentes…`);
  }
  await list();cloudMessage(`${saved} copiadas; ${skipped} já existentes; ${drafts} convertidas em rascunhos por pendências. ${failures.length?'Falhas: '+failures.slice(0,3).join(' | '):'Os originais locais foram preservados.'}`,!!failures.length);
 }catch(e){cloudMessage(e.message,true)}finally{cloudWorking=false;$('migrateLocal').disabled=false}
}
document.addEventListener('DOMContentLoaded',async()=>{
 const panel=document.createElement('section');panel.id='accountPanel';panel.className='card';
 panel.innerHTML=`<div class="card-title"><h2>Sua conta RIP</h2><span id="accountEmail"></span></div><p id="accountMessage" class="hint">Conectando…</p>
 <form id="authForm" hidden><p>Entre para guardar seus cupons e acessá-los em outros dispositivos. Os dados ficam privados na sua conta; não há participação em estatísticas coletivas nesta versão.</p><div class="fields"><label>E-mail<input id="authEmail" type="email" autocomplete="username" required maxlength="254"></label><label>Senha<input id="authPassword" type="password" autocomplete="current-password" minlength="8" maxlength="128" required></label></div><div class="account-actions"><button class="primary" type="submit">Entrar</button><button class="secondary" type="button" id="signup">Criar conta</button><button class="text-button" type="button" id="recover">Esqueci a senha</button></div></form>
 <div id="accountTools" hidden><div class="account-actions"><button class="secondary" id="migrateLocal" hidden></button><button class="text-button" id="exportLocalBackup" hidden>Backup dos dados locais antigos</button><button class="text-button" id="changePassword">Alterar senha</button><button class="text-button" id="logout">Sair</button></div><p class="hint">Compras salvas na nuvem. Copiar dados locais exige sua confirmação. Anexos antigos permanecem no navegador e nos backups locais.</p></div>
 <form id="passwordForm" hidden><label>Nova senha<input id="newPassword" type="password" minlength="8" maxlength="128" autocomplete="new-password" required></label><button class="primary" type="submit">Salvar nova senha</button></form>`;
 document.querySelector('main').prepend(panel);
 const more=document.createElement('button');more.id='loadMore';more.className='secondary';more.textContent='Carregar mais compras';more.hidden=true;$('purchaseList').after(more);
 const originalRender=renderList;renderList=function(){originalRender();decorateCloudList()};
 lockCloud();
 async function authAction(path,body){
  if(cloudWorking)return;cloudWorking=true;
  try{const result=await cloudRequest(path,body);$('authPassword').value='';if(result.user){await unlockCloud(result.user);cloudMessage('Conta conectada.')}else cloudMessage(result.message);return result}
  catch(e){cloudMessage(e.message,true)}finally{cloudWorking=false}
 }
 $('authForm').onsubmit=e=>{e.preventDefault();authAction('/api/auth/login',{email:$('authEmail').value,password:$('authPassword').value})};
 $('signup').onclick=()=>{if($('authForm').reportValidity())authAction('/api/auth/signup',{email:$('authEmail').value,password:$('authPassword').value})};
 $('recover').onclick=()=>{if($('authEmail').reportValidity())authAction('/api/auth/recover',{email:$('authEmail').value})};
 $('changePassword').onclick=()=>{$('passwordForm').hidden=!$('passwordForm').hidden};
 $('passwordForm').onsubmit=async e=>{e.preventDefault();const result=await authAction('/api/auth/password',{password:$('newPassword').value});if(result){$('newPassword').value='';$('passwordForm').hidden=true;cloudMessage('Senha alterada.')}};
 $('logout').onclick=async()=>{
  if(busy||cloudWorking)return;
  if(dirty&&!confirm('Sair da conta? Alterações não salvas serão perdidas.'))return;
  try{await cloudRequest('/api/auth/logout',{});lockCloud();cloudMessage('Você saiu da conta.')}catch(e){cloudMessage(e.message,true)}
 };
 $('migrateLocal').onclick=()=>migrateCloud();
 $('exportLocalBackup').onclick=exportBackup;
 $('loadMore').onclick=async()=>{
  if(busy)return;busy=true;
  try{const page=await cloudRequest('/api/purchases?offset='+cloudOffset);cloudOffset+=page.rows.length;cloudMore=page.hasMore;const ids=new Set(purchases.map(p=>p.id));purchases.push(...page.rows.filter(p=>!ids.has(p.id)));renderList()}catch(e){notify(e.message,true)}finally{busy=false}
 };
 $('exportBackup').onclick=async()=>{
  if(cloudWorking||busy)return;cloudWorking=true;
  try{const all=await cloudAll(),full=[];for(const p of all)full.push(await cloudRequest('/api/purchases?id='+p.id));downloadJSON({format:'rip-desktop',version:1,exportedAt:new Date().toISOString(),purchases:full,images:[]},'RIP-conta-backup.json');cloudMessage('Backup da conta exportado. Anexos locais antigos não fazem parte dele.')}
  catch(e){cloudMessage(e.message,true)}finally{cloudWorking=false}
 };
 $('importBackup').onchange=async e=>{
  try{const file=e.target.files[0];if(!file)return;const data=JSON.parse(await file.text());if(data.format!=='rip-desktop'||data.version!==1||!Array.isArray(data.purchases))throw Error('Backup incompatível.');await migrateCloud(data.purchases)}catch(e){cloudMessage(e.message,true)}finally{e.target.value=''}
 };
 // Consume Supabase's email-confirmation/recovery callback and remove tokens from URL immediately.
 const hash=new URLSearchParams(location.hash.slice(1));const recovery=hash.get('type')==='recovery';
 if(hash.has('access_token')||hash.has('error'))history.replaceState(null,'',location.pathname);
 try{
  const result=hash.has('access_token')?await cloudRequest('/api/auth/session',{access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token')}):await cloudRequest('/api/auth/status');
  await unlockCloud(result.user);cloudMessage(recovery?'Defina sua nova senha abaixo.':'Conta conectada.');
  if(recovery)$('passwordForm').hidden=false;
 }catch(e){cloudMessage(hash.has('error')?'O link expirou ou é inválido. Solicite outro.':e.message,true)}
});
