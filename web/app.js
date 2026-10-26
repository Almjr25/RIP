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

function renderList(){const confirmed=purchases.filter(p=>p.status==='confirmed');$('count').textContent=purchases.length;$('pending').textContent=purchases.length-confirmed.length;$('sum').textContent=money(confirmed.reduce((s,p)=>s+cents(p.receiptTotal),0));$('historyCount').textContent=`${purchases.length} ${purchases.length===1?'compra':'compras'}`;$('purchaseList').innerHTML=purchases.length?purchases.map(p=>`<button class="purchase" data-open="${esc(p.id)}"><span class="receipt-icon">▤</span><div><h3>${esc(p.store||'Compra sem identificação')}</h3><p>${esc(p.date?p.date.split('-').reverse().join('/'):'Data não informada')} · ${p.items.length} itens</p></div><span class="amount">${Number.isFinite(cents(p.receiptTotal))?money(cents(p.receiptTotal)):'Total pendente'}</span><span class="badge ${p.status==='confirmed'?'confirmed':''}">${p.status==='confirmed'?'Conferida':'Para revisar'}</span><span>↗</span></button>`).join(''):`<div class="empty"><div class="empty-icon">▤</div><h3>Seu primeiro cupom é o começo.</h3><p>Guarde os preços de hoje para entender suas compras de amanhã. Comece colando o texto de um cupom.</p><button class="primary" id="emptyAdd">＋ Adicionar primeiro cupom</button></div>`;document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>edit(purchases.find(p=>p.id===b.dataset.open)));if($('emptyAdd'))$('emptyAdd').onclick=()=>edit()}
function renderItems(){$('items').innerHTML=purchase.items.length?purchase.items.map((i,n)=>{const dup=purchase.items.some((j,k)=>k!==n&&j.description.toLowerCase()===i.description.toLowerCase()&&j.total===i.total);return `<div class="item"><div class="item-top"><span>${String(n+1).padStart(2,'0')}</span><input aria-label="Descrição do item ${n+1}" data-index="${n}" data-field="description" value="${esc(i.description)}" placeholder="Descrição do produto"><button class="remove" data-delete="${n}" aria-label="Excluir item ${n+1}">×</button></div><div class="item-fields">${[['quantity','Quantidade'],['unit','Unidade'],['unitPrice','Preço unitário (R$)'],['discount','Desconto item (R$)'],['total','Total item (R$)']].map(([k,label])=>`<label>${label}<input aria-label="${label} do item ${n+1}" data-index="${n}" data-field="${k}" value="${esc(i[k])}" ${k!=='unit'?'inputmode="decimal"':''}></label>`).join('')}</div>${dup?'<p class="item-warning">⚠ Possível repetição. Confira se o produto aparece repetido no cupom antes de excluir.</p>':''}${i.unitRaw&&i.unitRaw!==i.unit?`<p class="${i.unitNormalization==='unknown'?'item-warning':'hint'}">Unidade original: ${esc(i.unitRaw)}${i.unit?` → ${esc(i.unit)}`:' · não reconhecida; preencha o campo acima.'}</p>`:''}<p class="item-warning item-check" hidden></p><div class="item-source"><span>${i.source==='pasted-text'?'Do texto do cupom · confira os dados':i.source?'Registro anterior preservado':'Item inserido manualmente'}</span></div></div>`}).join(''):'<p class="hint">Nenhum item ainda. Cole o texto do cupom e selecione Interpretar texto.</p>';document.querySelectorAll('[data-field]').forEach(input=>input.oninput=()=>{purchase.items[+input.dataset.index][input.dataset.field]=input.value;invalidate();totals()});document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{purchase.items.splice(+b.dataset.delete,1);invalidate();renderItems();totals()});}

function totals(){let sum=0,valid=true,issues=0;for(const i of purchase.items){const q=decimal(i.quantity),price=decimal(i.unitPrice),discount=cents(i.discount),total=cents(i.total);if(!Number.isFinite(q)||q<=0||![price,discount,total].every(Number.isFinite)||Math.abs(lineCents(i.quantity,i.unitPrice)-discount-total)>1||!i.description.trim()||!String(i.unit||'').trim())issues++;if(!Number.isFinite(total))valid=false;else sum+=total}const d=cents($('discount').value),extra=cents($('extra').value),receipt=cents($('receiptTotal').value),total=sum-d+extra,diff=total-receipt;valid=valid&&[d,extra,total].every(Number.isFinite);$('subtotal').textContent=valid?money(sum):'Confira os valores';$('calculated').textContent=valid?money(total):'—';const live=$('liveTotals');if(live)live.textContent=`Soma: ${valid?money(sum):'—'} · Diferença: ${Number.isFinite(diff)?money(diff):'a conferir'}`;const node=$('difference');node.className='difference';if(!valid||!Number.isFinite(receipt))node.textContent='Informe valores válidos para conferir';else if(diff!==0){node.classList.add('bad');node.textContent=`Diferença a conferir: ${money(diff)}`}else{node.classList.add('good');node.textContent='✓ Total conciliado · diferença de R$ 0,00'}document.querySelectorAll('.item-check').forEach((node,n)=>{const i=purchase.items[n];const q=decimal(i.quantity),p=decimal(i.unitPrice),d=cents(i.discount),t=cents(i.total);let message='';if(!i.description.trim()||!String(i.unit||'').trim()||!Number.isFinite(q)||q<=0||![p,d,t].every(Number.isFinite))message='Preencha descrição, quantidade, unidade, preço, desconto e total conferindo o texto do cupom.';else if(Math.abs(lineCents(i.quantity,i.unitPrice)-d-t)>1)message=`A conta do item resulta em ${money(lineCents(i.quantity,i.unitPrice)-d)}, mas o total lido é ${money(t)}. Confira os campos.`;node.textContent=message;node.hidden=!message});return {valid,sum,total,diff,issues}}

function collect(){
  for(const k of ['store','cnpj','date','key','discount','extra','receiptTotal'])purchase[k]=$(k).value;
  purchase.reviewed=$('reviewed').checked;
  purchase.receiptText=$('receiptText').value;
  return purchase;
}
function invalidate(){dirty=true;purchase.status='draft';purchase.reviewed=false;$('reviewed').checked=false;$('stateBadge').textContent='Rascunho';$('stateBadge').className='badge';$('confirm').textContent='Confirmar compra'}
function edit(existing){
  purchase=existing?structuredClone(existing):{status:'draft',store:'',cnpj:'',date:'',key:'',discount:'0,00',extra:'0,00',receiptTotal:'',reviewed:false,items:[],images:[],receiptText:''};
  $('listView').hidden=true;$('editorView').hidden=false;$('notice').hidden=true;
  $('editorTitle').innerHTML=existing?'Revisar compra<span>.</span>':'Adicionar cupom<span>.</span>';
  $('navPurchases').classList.remove('active');$('navNew').classList.add('active');
  for(const k of ['store','cnpj','date','key','discount','extra','receiptTotal'])$(k).value=purchase[k]||'';
  $('receiptText').value=purchase.receiptText||'';$('reviewed').checked=!!purchase.reviewed;
  $('stateBadge').textContent=purchase.status==='confirmed'?'Conferida':'Rascunho';
  $('stateBadge').className='badge '+(purchase.status==='confirmed'?'confirmed':'');
  $('confirm').textContent=purchase.status==='confirmed'?'Salvar compra conferida':'Confirmar compra';
  $('legacyNotice').hidden=!(purchase.images?.length);
  renderItems();renderAnalysis();totals();dirty=false;window.scrollTo(0,0);
}
async function list(){
  if(busy)return;
  try{purchases=await api('/api/purchases');$('editorView').hidden=true;$('listView').hidden=false;$('navPurchases').classList.add('active');$('navNew').classList.remove('active');renderList()}
  catch(e){notify('Não foi possível carregar as compras. '+e.message,true)}
}
function renderAnalysis(){
  const analysis=purchase.analysis;
  $('reconstructionSummary').hidden=!analysis;
  if(!analysis)return;
  $('reconstructionSummary').innerHTML=`<strong>${purchase.items.length} itens para conferir</strong><p>Confira nome, CNPJ e total; informe a data da compra. A unidade original é preservada quando normalizada.</p>${(analysis.warnings||[]).map(w=>`<p class="item-warning">⚠ ${esc(w)}</p>`).join('')}`;
}
function interpretText(){
  if(busy)return;
  const text=$('receiptText').value;
  if(!text.trim()){notify('Cole o texto da consulta da NFC-e, começando pelo estabelecimento e terminando no total.',true);$('receiptText').focus();return}
  if(text.length>500000){notify('O texto é muito extenso. Cole somente o conteúdo deste cupom.',true);return}
  const analysis=ReceiptParser.parse(text,'pasted-text');
  if(!analysis.items.length){notify('Não foi possível identificar produtos. Inclua descrição, quantidade, unidade, preço e total dos itens. Seus itens anteriores foram preservados.',true);return}
  if(purchase.items.length&&!confirm('Substituir a lista de itens pelo texto colado? Correções manuais nesses itens serão substituídas. A lista não será duplicada.'))return;
  purchase.items=analysis.items;
  purchase.receiptText=text;purchase.parsedText=text;
  if(!purchase.originalText)purchase.originalText=text;
  purchase.inputMethod='text';
  purchase.analysis={warnings:analysis.warnings,expectedCount:analysis.expectedCount};
  for(const k of ['store','cnpj','receiptTotal'])if(analysis[k]&&!$(k).value.trim())$(k).value=analysis[k];
  invalidate();renderItems();renderAnalysis();totals();
  notify(`${analysis.items.length} itens extraídos do texto. Confira os dados e informe a data.`);
  $('reconstructionSummary').scrollIntoView({behavior:'smooth',block:'start'});
}
async function save(confirmed){
  if(busy)return;
  collect();
  if(confirmed&&((purchase.parsedText&&purchase.receiptText!==purchase.parsedText)||(!purchase.parsedText&&purchase.receiptText.trim()))){notify('O texto foi alterado. Selecione Interpretar texto antes de confirmar a compra.',true);return}
  if(confirmed&&purchase.cnpj.trim()&&!ReceiptParser.validCNPJ(purchase.cnpj)){notify('Confira o CNPJ: os dígitos verificadores não conferem. Corrija-o ou deixe o campo vazio se não estiver disponível.',true);return}
  if(confirmed){const t=totals();if(!purchase.items.length||!t.valid||t.diff!==0||t.issues||!purchase.reviewed||!purchase.store.trim()||!purchase.date){notify('Confira os itens, informe estabelecimento e data, zere a diferença e marque a revisão antes de confirmar.',true);return}}
  purchase.status=confirmed?'confirmed':'draft';busy=true;
  try{purchase=await api('/api/purchases',purchase);dirty=false;busy=false;await list();notify(confirmed?'Compra conferida e salva no seu histórico.':'Rascunho salvo. Você pode continuar depois.')}
  catch(e){notify(e.message,true)}finally{busy=false}
}
for(const id of ['newPurchase','navNew'])$(id).onclick=()=>{if(!busy&&(!dirty||confirm('Descartar alterações não salvas e abrir outra compra?')))edit()};
for(const id of ['back','navPurchases'])$(id).onclick=()=>{if(!dirty||confirm('Sair da edição? Alterações não salvas serão perdidas.')){dirty=false;list()}};
$('process').onclick=interpretText;
$('receiptText').oninput=invalidate;
$('addItem').onclick=()=>{purchase.items.push({id:crypto.randomUUID().replaceAll('-',''),description:'',quantity:'1',unit:'UN',unitPrice:'0,00',discount:'0,00',total:'0,00'});invalidate();renderItems();totals()};
for(const k of ['store','cnpj','date','key','discount','extra','receiptTotal'])$(k).oninput=()=>{invalidate();totals()};
$('reviewed').onchange=()=>{purchase.reviewed=$('reviewed').checked;dirty=true};
$('save').onclick=()=>save(false);$('confirm').onclick=()=>save(true);
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
const live=document.createElement('button');live.id='liveTotals';live.onclick=()=>document.querySelector('.summary').scrollIntoView({behavior:'smooth'});$('editorView').appendChild(live);
if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
list();
