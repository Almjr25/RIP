import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>readFileSync(join(root,name),'utf8');
let html=read('web/index.html'),js=read('web/app.js');
const cloud=process.argv.includes('--vercel')&&process.env.RIP_CLOUD_ENABLED==='true';
const apiLine=js.split('\n').find(line=>line.startsWith('async function api('));
if(!apiLine)throw Error('Adaptador da API não encontrado.');
js=js.replace(apiLine,cloud?'async function api(path,body){return cloudAPI(path,body)}':'async function api(path,body){return localAPI(path,body)}');
if(cloud)js=js.replace('\nlist();\n','\n// Cloud initialization waits for authentication.\n');
js=js.replace("if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});",'');
for(const [from,to] of [
 ['<script src="/receipt.js" defer></script>',''],
 ['<script src="/fiscal.js" defer></script>',''],
 ['<script src="/validation.js" defer></script>',''],
 ['<link rel="manifest" href="/manifest.json">',''],
 ['<link rel="icon" href="/icon.svg" type="image/svg+xml">',''],
 ['<link rel="stylesheet" href="/style.css">','<style>'+read('web/style.css')+'</style>'],
 ['href="/"','href="#"'],
 ['Armazenados neste dispositivo servidor.','Salvos neste navegador. Exporte backups.'],
 ['PRIMEIRA VERSÃO · LOCAL','VERSÃO TEXTO · 0.4'],
 ['<title>RIP ·','<title>RIP 0.4 ·'],
 ['<div class="section-title">','<div class="backup-actions"><button class="secondary" id="exportBackup">Exportar backup</button><label class="secondary" style="cursor:pointer">Importar backup<input type="file" id="importBackup" accept="application/json,.json" hidden></label></div><div class="section-title">'],
 ['<script src="/app.js" defer></script>','<script>'+read('web/receipt.js')+'\n'+read('web/fiscal.js')+'\n'+read('web/validation.js')+'\n'+read('portable/local.js')+'\n'+(cloud?read('web/cloud.js')+'\n':'')+js+'</script>']
])html=html.replaceAll(from,()=>to);
if(cloud){
 html=html.replace('<body>','<body class="cloud-locked">');
 html=html.replace('Salvos neste navegador. Exporte backups.','Salvos na sua conta. Acesso entre dispositivos.');
 html=html.replace('VERSÃO TEXTO · 0.4','CONTA PESSOAL');
}
if(process.argv.includes('--vercel')){
 const out=join(root,'dist');mkdirSync(out,{recursive:true});
 html=html.replace('</head>','<link rel="icon" href="/icon.svg" type="image/svg+xml"></head>');
 writeFileSync(join(out,'index.html'),html);copyFileSync(join(root,'web/icon.svg'),join(out,'icon.svg'));
 console.log(cloud?'Build com login e banco remoto gerado em dist/.':'Build estático gerado em dist/; processamento de texto inteiramente local.');
}else{writeFileSync(join(root,'RIP.html'),html);console.log('RIP.html gerado:',Buffer.byteLength(html),'bytes')}
