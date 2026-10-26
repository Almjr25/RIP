// Armazenamento local; não há envio do texto nem dependências externas.
const localDB = new Promise((resolve,reject)=>{const r=indexedDB.open('rip-desktop-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('purchases',{keyPath:'id'});r.result.createObjectStore('images',{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('O navegador não permitiu abrir o banco local. Use Chrome ou Edge em uma janela normal.'))});
async function readAll(store){const db=await localDB;return new Promise((resolve,reject)=>{const t=db.transaction(store,'readonly'),r=t.objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function writeLocal(store,value){const db=await localDB;return new Promise((resolve,reject)=>{const t=db.transaction(store,'readwrite');t.objectStore(store).put(value);t.oncomplete=()=>resolve(value);t.onerror=()=>reject(Error('Não foi possível guardar os dados. O espaço do navegador pode estar cheio.'));t.onabort=()=>reject(t.error)})}
function imageReferences(p,refs=new Set()){
  for(const im of p.images||[])if(/^[a-f0-9]{64}\.png$/.test(im.image))refs.add(im.image);
  for(const item of p.items||[])if(/^[a-f0-9]{64}\.png$/.test(item.source||''))refs.add(item.source);
  for(const version of p.history||[])imageReferences(version,refs);
  return refs;
}
async function deleteLocalPurchase(id){
  if(!/^[a-f0-9]{32}$/.test(id||''))throw Error('Identificação da nota inválida.');
  const db=await localDB;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['purchases','images'],'readwrite'),store=tx.objectStore('purchases');
    let error;
    const request=store.getAll();
    request.onsuccess=()=>{
      const target=request.result.find(p=>p.id===id);
      if(!target){error=Error('Esta nota não foi encontrada. Atualize o histórico.');tx.abort();return}
      const retained=new Set();
      for(const p of request.result)if(p.id!==id)imageReferences(p,retained);
      for(const image of imageReferences(target))if(!retained.has(image))tx.objectStore('images').delete(image);
      store.delete(id);
    };
    tx.oncomplete=()=>resolve({deleted:id});
    tx.onerror=()=>reject(error||tx.error||Error('Não foi possível excluir a nota.'));
    tx.onabort=()=>reject(error||tx.error||Error('A exclusão foi cancelada.'));
  });
}

async function localAPI(path,body){
  await localDB;
  if(path==='/api/purchases/delete')return deleteLocalPurchase(body?.id);
  if(path==='/api/purchases'&&!body)return (await readAll('purchases')).reverse();
  if(path==='/api/purchases'&&body){
    const p=structuredClone(body);if(p.status==='confirmed'){const checks=ReceiptValidation.validate(p);if(!checks.ready)throw Error(checks.issues.map(x=>x.message).join(' '))}p.id=p.id||crypto.randomUUID().replaceAll('-','');
    const key=ReceiptFiscal.normalize(p.key);
    const fiscal=ReceiptFiscal.inspect(key);
    p.fiscalValidation={keyStatus:fiscal.valid?'valid_format':key?'invalid':'missing',authenticity:'not_checked'};
    p.key=key;
    const all=await readAll('purchases');
    if(fiscal.valid&&all.some(x=>x.id!==p.id&&ReceiptFiscal.normalize(x.key)===key))throw Error('Já existe uma compra com esta chave fiscal.');
    const previous=all.find(x=>x.id===p.id);p.history=previous?.history||[];
    if(previous){const snapshot=structuredClone(previous);delete snapshot.history;p.history.push(snapshot)}
    p.updated=new Date().toISOString();await writeLocal('purchases',p);return p;
  }
  throw Error('Operação local desconhecida.');
}
function downloadJSON(value,name){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}
async function exportBackup(){try{downloadJSON({format:'rip-desktop',version:1,exportedAt:new Date().toISOString(),purchases:await readAll('purchases'),images:await readAll('images')},'RIP-backup-'+new Date().toISOString().slice(0,10)+'.json');notify('Backup exportado com compras, textos e anexos antigos, quando houver. Guarde-o em um lugar seguro.')}catch(e){notify(e.message,true)}}
async function importBackup(file){try{if(!file)return;const data=JSON.parse(await file.text());if(data.format!=='rip-desktop'||data.version!==1||!Array.isArray(data.purchases)||!Array.isArray(data.images))throw Error('Este arquivo não é um backup compatível do RIP.');for(const im of data.images){if(!/^[a-f0-9]{64}\.png$/.test(im.id)||!/^data:image\/(png|jpeg|webp);base64,/.test(im.data))throw Error('Backup com referência de imagem inválida.')}for(const p of data.purchases){if(!/^[a-f0-9]{32}$/.test(p.id)||!Array.isArray(p.items)||!Array.isArray(p.images)||!['draft','confirmed'].includes(p.status))throw Error('Backup com compra inválida.');for(const i of p.items)if(typeof i.description!=='string')throw Error('Backup com item inválido.');for(const im of p.images)if(!data.images.some(x=>x.id===im.image))throw Error('Backup incompleto: faltam imagens.')}if(!confirm('Importar este backup? Compras com a mesma identificação serão substituídas. As demais serão mantidas.'))return;const db=await localDB;await new Promise((resolve,reject)=>{const t=db.transaction(['images','purchases'],'readwrite');for(const im of data.images)t.objectStore('images').put(im);for(const p of data.purchases)t.objectStore('purchases').put(p);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error)});await list();notify('Backup importado. Confira as compras antes de continuar.')}catch(e){notify('Não foi possível importar: '+e.message,true)}}
document.addEventListener('DOMContentLoaded',()=>{$('exportBackup').onclick=exportBackup;$('importBackup').onchange=e=>importBackup(e.target.files[0]);if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});});
