const $=id=>document.getElementById(id);
let purchases=[],purchase,busy=false,dirty=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
function decimal(s){s=String(s??'').trim().replace(/R\$|\s/g,'');if(!s)return NaN;if(s.includes(','))s=s.replaceAll('.','').replace(',','.');if(!/^\d+(\.\d+)?$/.test(s))return NaN;return Number(s)}
function fraction(s){s=String(s??'').trim().replace(/R\$|\s/g,'');if(s.includes(','))s=s.replaceAll('.','').replace(',','.');if(!/^\d+(\.\d+)?$/.test(s)||s.length>24)return null;const [a,b='']=s.split('.');return [BigInt(a+b),10n**BigInt(b.length)]}
function rounded(n,d){return Number((n*2n+d)/(d*2n))}
function cents(s){const f=fraction(s);return f?rounded(f[0]*100n,f[1]):NaN}
function lineCents(q,p){const a=fraction(q),b=fraction(p);return a&&b?rounded(a[0]*b[0]*100n,a[1]*b[1]):NaN}
function notify(s,error=false){$('notice').textContent=s;$('notice').className=error?'error':'';$('notice').hidden=false;$('notice').scrollIntoView({block:'nearest',behavior:'smooth'})}
async function api(path,body){const r=await fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});let value;try{value=await r.json()}catch{throw Error('Resposta inesperada do servidor.')}if(!r.ok)throw Error(value.error||'Não foi possível concluir.');return value}

function renderList(){const confirmed=purchases.filter(p=>p.status==='confirmed');$('count').textContent=purchases.length;$('pending').textContent=purchases.length-confirmed.length;$('sum').textContent=money(confirmed.reduce((s,p)=>s+cents(p.receiptTotal),0));$('historyCount').textContent=`${purchases.length} ${purchases.length===1?'compra':'compras'}`;$('purchaseList').innerHTML=purchases.length?purchases.map(p=>`<button class="purchase" data-open="${esc(p.id)}"><span class="receipt-icon">▤</span><div><h3>${esc(p.store||'Compra sem identificação')}</h3><p>${esc(p.date?p.date.split('-').reverse().join('/'):'Data não informada')} · ${p.items.length} itens</p></div><span class="amount">${Number.isFinite(cents(p.receiptTotal))?money(cents(p.receiptTotal)):'Total pendente'}</span><span class="badge ${p.status==='confirmed'?'confirmed':''}">${p.status==='confirmed'?'Registrada':'Rascunho'}</span><span>↗</span></button>`).join(''):`<div class="empty"><div class="empty-icon">▤</div><h3>Seu primeiro cupom é o começo.</h3><p>Guarde os preços de hoje para entender suas compras de amanhã. Comece colando o texto de um cupom.</p><button class="primary" id="emptyAdd">＋ Adicionar primeiro cupom</button></div>`;document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>edit(purchases.find(p=>p.id===b.dataset.open)));if($('emptyAdd'))$('emptyAdd').onclick=()=>edit()}

function snapshot(){const p={...purchase};for(const k of ['store','cnpj','date','key','discount','extra','receiptTotal'])p[k]=$(k).value;p.receiptText=$('receiptText').value;return p}
function renderItems(){
 const result=ReceiptValidation.validate(snapshot());
 $('items').innerHTML=purchase.items.length?purchase.items.map((i,n)=>{
  const invalid=result.issues.some(x=>x.index===n);
  return `<details class="item" ${invalid?'open':''}><summary><span class="item-number">${String(n+1).padStart(2,'0')}</span><div class="item-overview"><strong class="item-name">${esc(i.description||'Produto sem descrição')}</strong><span class="item-meta">${esc(i.quantity)} ${esc(i.unit)} · ${Number.isFinite(cents(i.unitPrice))?money(cents(i.unitPrice)):'Preço ausente'}${cents(i.discount)>0?` · desconto ${money(cents(i.discount))}`:''}</span></div><strong class="item-amount">${Number.isFinite(cents(i.total))?money(cents(i.total)):'Total ausente'}</strong><span class="item-expand">Editar⌄</span></summary><div class="item-editor"><label>Descrição<input aria-label="Descrição do item ${n+1}" data-index="${n}" data-field="description" value="${esc(i.description)}"></label><div class="item-fields">${[['quantity','Quantidade'],['unit','Unidade'],['unitPrice','Preço unitário (R$)'],['discount','Desconto do item (R$)'],['total','Total líquido do item (R$)']].map(([k,label])=>`<label>${label}<input aria-label="${label} do item ${n+1}" data-index="${n}" data-field="${k}" value="${esc(i[k])}" ${k!=='unit'?'inputmode="decimal"':''}></label>`).join('')}</div><p class="hint">Ajuste apenas se houver uma pendência de importação ou um desconto do item ainda não identificado.</p>${i.unitRaw&&i.unitRaw!==i.unit?`<p class="hint">Unidade original: ${esc(i.unitRaw)} → ${esc(i.unit||'não identificada')}</p>`:''}<p class="item-warning item-check" hidden></p><button class="text-button remove-item" data-delete="${n}">Excluir item</button></div></details>`;
 }).join(''):'<p class="hint">Cole o texto da nota e selecione Interpretar texto.</p>';
 document.querySelectorAll('[data-field]').forEach(input=>input.oninput=()=>{purchase.items[+input.dataset.index][input.dataset.field]=input.value;purchase.itemsEdited=true;invalidate();totals()});
 document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{purchase.items.splice(+b.dataset.delete,1);purchase.itemsEdited=true;invalidate();renderItems();totals()});
}
function totals(){
 const r=ReceiptValidation.validate(snapshot());
 $('subtotal').textContent=r.subtotal===null?'Total indisponível':money(r.subtotal);
 $('calculated').textContent=r.total===null?'—':money(r.total);
 const live=$('liveTotals');if(live)live.textContent=`Soma: ${r.subtotal===null?'—':money(r.subtotal)} · Diferença: ${r.difference===null?'indisponível':money(r.difference)}`;
 const node=$('difference');node.className='difference';
 if(r.difference===null)node.textContent='Complete os valores ausentes para conciliar';
 else if(r.difference!==0){node.classList.add('bad');node.textContent=`Diferença: ${money(r.difference)}`}
 else{node.classList.add('good');node.textContent='✓ Total compatível com a nota'}
 document.querySelectorAll('.item').forEach((row,n)=>{
  const i=purchase.items[n],errors=r.issues.filter(x=>x.index===n),check=row.querySelector('.item-check');
  row.classList.toggle('item-invalid',!!errors.length);
  if(errors.length)row.open=true;
  check.textContent=errors.map(x=>x.message).join(' ');check.hidden=!errors.length;
  row.querySelector('.item-name').textContent=i.description||'Produto sem descrição';
  row.querySelector('.item-meta').textContent=`${i.quantity} ${i.unit} · ${Number.isFinite(cents(i.unitPrice))?money(cents(i.unitPrice)):'Preço ausente'}${cents(i.discount)>0?` · desconto ${money(cents(i.discount))}`:''}`;
  row.querySelector('.item-amount').textContent=Number.isFinite(cents(i.total))?money(cents(i.total)):'Total ausente';
 });
 renderAnalysis(r);return r;
}

function collect(){
  for(const k of ['store','cnpj','date','key','discount','extra','receiptTotal'])purchase[k]=$(k).value;
  delete purchase.reviewed;
  purchase.receiptText=$('receiptText').value;
  return purchase;
}
function invalidate(){dirty=true;purchase.status='draft';$('stateBadge').textContent='Rascunho';$('stateBadge').className='badge';$('confirm').textContent='Salvar compra'}
function edit(existing){
  purchase=existing?structuredClone(existing):{status:'draft',store:'',cnpj:'',date:'',key:'',discount:'0,00',extra:'0,00',receiptTotal:'',items:[],images:[],receiptText:''};
  $('listView').hidden=true;$('editorView').hidden=false;$('notice').hidden=true;
  $('editorTitle').innerHTML=existing?'Detalhes da compra<span>.</span>':'Adicionar cupom<span>.</span>';
  $('navPurchases').classList.remove('active');$('navNew').classList.add('active');
  for(const k of ['store','cnpj','date','key','discount','extra','receiptTotal'])$(k).value=purchase[k]||'';
  $('receiptText').value=purchase.receiptText||'';
  $('stateBadge').textContent=purchase.status==='confirmed'?'Registrada':'Rascunho';
  $('stateBadge').className='badge '+(purchase.status==='confirmed'?'confirmed':'');
  $('confirm').textContent='Salvar compra';
  $('legacyNotice').hidden=!(purchase.images?.length);
  $('deletePurchase').hidden=!purchase.id;
  $('textDetails').open=!purchase.items.length;
  $('adjustments').open=Boolean(cents(purchase.discount)||cents(purchase.extra));
  renderItems();totals();dirty=false;window.scrollTo(0,0);
}
async function list(){
  if(busy)return;
  try{purchases=await api('/api/purchases');$('editorView').hidden=true;$('listView').hidden=false;$('navPurchases').classList.add('active');$('navNew').classList.remove('active');renderList()}
  catch(e){notify('Não foi possível carregar as compras. '+e.message,true)}
}
function renderAnalysis(result){
 const r=result||ReceiptValidation.validate(snapshot());
 $('reconstructionSummary').hidden=!purchase.items.length&&!purchase.parsedText;
 const globals=r.issues.filter(x=>x.index===null),itemIssues=new Set(r.issues.filter(x=>x.index!==null).map(x=>x.index));
 $('reconstructionSummary').innerHTML=`<strong>${r.ready?(purchase.status==='confirmed'?'Compra registrada':'Pronta para salvar'):globals.length||itemIssues.size?'Dados pendentes':'Importação concluída'}</strong><p>${r.itemCount} itens importados${r.expectedCount!==null?` de ${r.expectedCount} informados na nota`:''} · ${r.difference===0?'total compatível':'conciliação pendente'}.</p>${globals.length?`<ul>${globals.map(x=>`<li>${esc(x.message)}</li>`).join('')}</ul>`:''}${itemIssues.size?`<p>${itemIssues.size} ${itemIssues.size===1?'item precisa':'itens precisam'} de ajuste. Os campos correspondentes estão abertos abaixo.</p>`:''}`;
 $('reconstructionSummary').classList.toggle('ready',r.ready);
 const step=(!purchase.items.length&&!purchase.parsedText)?0:r.ready?2:1;
 document.querySelectorAll('.workflow>span').forEach((node,n)=>node.classList.toggle('selected',n===step));
}
function interpretText(){
  if(busy)return;
  const text=$('receiptText').value;
  if(!text.trim()){notify('Cole o texto da consulta da NFC-e, começando pelo estabelecimento e terminando no total.',true);$('receiptText').focus();return}
  if(text.length>500000){notify('O texto é muito extenso. Cole somente o conteúdo deste cupom.',true);return}
  const analysis=ReceiptParser.parse(text,'pasted-text');
  if(!analysis.items.length){notify('Não foi possível identificar produtos. Inclua descrição, quantidade, unidade, preço e total dos itens. Seus itens anteriores foram preservados.',true);return}
  if(text===purchase.parsedText&&!purchase.itemsEdited){notify('Este texto já foi importado. A lista foi mantida.');return}
  if(purchase.items.length&&(purchase.itemsEdited||!purchase.parsedText)&&!confirm('Substituir os itens? Alterações manuais da lista serão substituídas pelo texto.'))return;
  purchase.items=analysis.items;
  purchase.receiptText=text;purchase.parsedText=text;
  if(!purchase.originalText)purchase.originalText=text;
  purchase.inputMethod='text';purchase.itemsEdited=false;
  purchase.analysis={warnings:analysis.warnings,expectedCount:analysis.expectedCount};
  purchase.autoFields=purchase.autoFields||{};
  for(const k of ['store','cnpj','receiptTotal','discount','extra']){
    const value=analysis[k]??((['discount','extra'].includes(k)&&purchase.autoFields[k]!==undefined)?'0,00':undefined);
    if(value!==undefined&&value!==''&&!purchase.manualFields?.[k]&&(!$(k).value.trim()||purchase.autoFields[k]!==undefined||(['discount','extra'].includes(k)&&cents($(k).value)===0))){$(k).value=value;purchase.autoFields[k]=value}
  }
  $('adjustments').open=Boolean(cents($('discount').value)||cents($('extra').value));
  invalidate();renderItems();totals();$('textDetails').open=false;
  notify(`${analysis.items.length} itens importados. Informe a data; o RIP verifica os valores automaticamente.`);
  $('reconstructionSummary').scrollIntoView({behavior:'smooth',block:'start'});
}
async function save(confirmed){
  if(busy)return;
  collect();
  const checks=totals();
  if(confirmed&&!checks.ready){notify(checks.issues.filter(x=>x.index===null).map(x=>x.message).join(' ')||'Complete os campos pendentes nos itens destacados.',true);return}
  if(confirmed)purchase.validation={method:'automatic',checkedAt:new Date().toISOString(),itemCount:checks.itemCount,expectedCount:checks.expectedCount,difference:checks.difference};
  purchase.status=confirmed?'confirmed':'draft';busy=true;
  try{purchase=await api('/api/purchases',purchase);dirty=false;busy=false;await list();notify(confirmed?'Compra registrada no seu histórico.':'Rascunho salvo. Você pode continuar depois.')}
  catch(e){notify(e.message,true)}finally{busy=false}
}
for(const id of ['newPurchase','navNew'])$(id).onclick=()=>{if(!busy&&(!dirty||confirm('Descartar alterações não salvas e abrir outra compra?')))edit()};
for(const id of ['back','navPurchases'])$(id).onclick=()=>{if(!dirty||confirm('Sair da edição? Alterações não salvas serão perdidas.')){dirty=false;list()}};
$('process').onclick=interpretText;
$('receiptText').oninput=()=>{invalidate();totals()};
$('addItem').onclick=()=>{purchase.items.push({id:crypto.randomUUID().replaceAll('-',''),description:'',quantity:'1',unit:'UN',unitPrice:'0,00',discount:'0,00',total:'0,00'});purchase.itemsEdited=true;invalidate();renderItems();totals()};
for(const k of ['store','cnpj','date','key','discount','extra','receiptTotal'])$(k).oninput=()=>{purchase.manualFields=purchase.manualFields||{};purchase.manualFields[k]=true;invalidate();totals()};
$('save').onclick=()=>save(false);$('confirm').onclick=()=>save(true);
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
const live=document.createElement('button');live.id='liveTotals';live.onclick=()=>document.querySelector('.summary').scrollIntoView({behavior:'smooth'});$('editorView').appendChild(live);
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
list();

async function removePurchase(){
 if(busy||!purchase?.id)return;
 const label=[purchase.store||'Estabelecimento não informado',purchase.date?purchase.date.split('-').reverse().join('/'):'Data não informada'].join(' · ');
 if(!confirm(`Excluir a nota de ${label}? Serão removidos seus itens, texto e histórico de alterações. Anexos antigos exclusivos desta nota também serão removidos. Não é possível desfazer; backups anteriores ainda podem restaurá-la.`))return;
 busy=true;$('deletePurchase').disabled=true;
 try{const result=await api('/api/purchases/delete',{id:purchase.id});dirty=false;purchase=null;busy=false;await list();notify('Nota excluída. '+(result.warnings?.length?result.warnings.join(' '):'O histórico e os totais foram atualizados.'))}
 catch(e){notify('Não foi possível excluir: '+e.message,true)}
 finally{busy=false;$('deletePurchase').disabled=false}
}
$('deletePurchase').onclick=removePurchase;
