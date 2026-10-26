import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>readFileSync(join(root,name),'utf8');
let html=read('web/index.html'),js=read('web/app.js');
const apiLine=js.split('\n').find(line=>line.startsWith('async function api('));
if(!apiLine)throw Error('Adaptador da API não encontrado.');
js=js.replace(apiLine,'async function api(path,body){return localAPI(path,body)}');
js=js.replace("if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});",'');
for(const [from,to] of [
 ['<script src="/receipt.js" defer></script>',''],
 ['<link rel="manifest" href="/manifest.json">',''],
 ['<link rel="icon" href="/icon.svg" type="image/svg+xml">',''],
 ['<link rel="stylesheet" href="/style.css">','<style>'+read('web/style.css')+'</style>'],
 ['href="/"','href="#"'],
 ['Armazenados neste dispositivo servidor.','Salvos neste navegador. Exporte backups.'],
 ['PRIMEIRA VERSÃO · LOCAL','VERSÃO TEXTO · 0.3'],
 ['<title>RIP ·','<title>RIP 0.3 ·'],
 ['<div class="section-title">','<div class="backup-actions"><button class="secondary" id="exportBackup">Exportar backup</button><label class="secondary" style="cursor:pointer">Importar backup<input type="file" id="importBackup" accept="application/json,.json" hidden></label></div><div class="section-title">'],
 ['<script src="/app.js" defer></script>','<script>'+read('web/receipt.js')+'\n'+read('portable/local.js')+'\n'+js+'</script>']
])html=html.replaceAll(from,()=>to);
if(process.argv.includes('--vercel')){
 const out=join(root,'dist');mkdirSync(out,{recursive:true});
 html=html.replace('</head>','<link rel="icon" href="/icon.svg" type="image/svg+xml"></head>');
 writeFileSync(join(out,'index.html'),html);copyFileSync(join(root,'web/icon.svg'),join(out,'icon.svg'));
 console.log('Build estático gerado em dist/; processamento de texto inteiramente local.');
}else{writeFileSync(join(root,'RIP.html'),html);console.log('RIP.html gerado:',Buffer.byteLength(html),'bytes')}
