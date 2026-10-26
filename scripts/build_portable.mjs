import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFileSync(join(root, name), 'utf8');
let html = read('web/index.html');
let js = read('web/app.js');
const apiLine = js.split('\n').find(line => line.startsWith('async function api('));
if (!apiLine) throw new Error('Adaptador da API não encontrado.');
js = js.replace(apiLine, 'async function api(path,body){return localAPI(path,body)}');
for (const [from, to] of [
  ["'/api/images/'+x.image", 'imageURLs.get(x.image)'],
  ["'/api/images/'+r.image", 'imageURLs.get(r.image)'],
  ["'/api/images/'+b.dataset.source", 'imageURLs.get(b.dataset.source)'],
  ["if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});", '']
]) js = js.replaceAll(from, to);
const replacements = [
  ['<script src="/receipt.js" defer></script>', ''],
  ['<link rel="manifest" href="/manifest.json">', ''],
  ['<link rel="icon" href="/icon.svg" type="image/svg+xml">', ''],
  ['<link rel="stylesheet" href="/style.css">', '<style>' + read('web/style.css') + '</style>'],
  ['href="/"', 'href="#"'],
  ['Armazenados neste dispositivo servidor.', 'Salvos neste navegador. Exporte backups.'],
  ['PRIMEIRA VERSÃO · LOCAL', 'VERSÃO DESKTOP · HTML 0.2'],
  ['<title>RIP ·', '<title>RIP 0.2 ·'],
  ['As imagens são processadas no servidor do RIP e ficam vinculadas à compra.', 'As imagens são processadas neste computador. O OCR baixa componentes gratuitos da internet, sem enviar seus cupons.'],
  ['Sem envio para APIs de OCR', 'OCR local no navegador'],
  ['<div class="sidebar-bottom">', '<div class="sidebar-bottom"><button class="secondary full" id="exportBackup">Exportar backup</button><label class="secondary full" style="text-align:center;cursor:pointer">Importar backup<input type="file" id="importBackup" accept="application/json,.json" hidden></label><p>Use sempre o mesmo navegador e arquivo. Limpar os dados do navegador pode apagar o histórico. O HTML sozinho não contém suas compras.</p>'],
  ['<script src="/app.js" defer></script>', '<script>' + read('web/receipt.js') + '\n' + read('portable/local.js') + '\n' + js + '</script>']
];
for (const [from, to] of replacements) html = html.replaceAll(from, () => to);
if (process.argv.includes('--vercel')) {
  const output = join(root, 'dist');
  mkdirSync(output, { recursive: true });
  html = html.replace('VERSÃO DESKTOP · HTML 0.2', 'VERSÃO WEB · 0.2');
  html = html.replace('Use sempre o mesmo navegador e arquivo.', 'Use sempre o mesmo navegador e endereço do site.');
  html = html.replace('</head>', '<link rel="icon" href="/icon.svg" type="image/svg+xml"></head>');
  writeFileSync(join(output, 'index.html'), html);
  copyFileSync(join(root, 'web/icon.svg'), join(output, 'icon.svg'));
  console.log('Build estático gerado em dist/ (sem servidor, banco pessoal ou arquivos fonte).');
} else {
  writeFileSync(join(root, 'RIP.html'), html);
  console.log('RIP.html gerado:', Buffer.byteLength(html), 'bytes');
}
