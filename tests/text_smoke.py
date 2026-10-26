"""Fluxo de texto: build estático/SQLite, unidades, validação e backups legados."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
BACKEND=os.environ.get('RIP_TEST_BACKEND')=='1'
PORT=8008 if BACKEND else 8009
URL=f'http://127.0.0.1:{PORT}'
KEY1='26261011222333000181650010000000011123456784'
KEY2='26261011222333000181650010000000021123456781'
TEXT='''MERCADO DE TESTE LTDA
CNPJ: 11.222.333/0001-81
PRODUTO A
(Código: 1)
Qtde.:
1
UN:
UND9
Vl. Unit.:
17,9
Vl. Total
17,90
PRODUTO B (Código: 2)
Qtde.:\t0,544\tUN:\tKG9\tVl. Unit.:\t42,9
Vl. Total
23,34
PRODUTO C (Código: 3)
Qtde.: 5 UN: PCT9Vl. Unit.: 7,59 37,95
Qtd. total de itens: 3
Valor a pagar R$:
79,19'''

def main():
 with tempfile.TemporaryDirectory(prefix='rip-text-') as temp:
  env=dict(os.environ,RIP_DATA_DIR=temp,PORT=str(PORT))
  cmd=[sys.executable,str(ROOT/'server.py')] if BACKEND else [sys.executable,'-m','http.server',str(PORT),'--bind','127.0.0.1','--directory',str(ROOT/'dist')]
  server=subprocess.Popen(cmd,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  try:
   for _ in range(50):
    try:
     urllib.request.urlopen(URL,timeout=1);break
    except OSError:time.sleep(.1)
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context(accept_downloads=True,viewport={'width':1440,'height':1000})
    page=context.new_page();errors=[];external=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:external.append(r.url) if r.url.startswith(('http:','https:')) and not r.url.startswith(URL) else None)
    accept_dialog=lambda d:d.accept()
    page.on('dialog',accept_dialog)
    def paste(value):
     page.locator('#textDetails').evaluate('(el)=>el.open=true')
     page.locator('#receiptText').fill(value)
    def interpret():
     page.locator('#textDetails').evaluate('(el)=>el.open=true')
     page.locator('#process').click()
    page.goto(URL)
    assert page.locator('#reviewed').count()==0
    assert page.locator('input[accept*="image"]').count()==0
    page.locator('#newPurchase').click()
    assert page.locator('#deletePurchase').is_hidden()
    paste(TEXT)
    page.locator('#save').click()
    page.wait_for_function("!document.getElementById('listView').hidden")
    page.locator('[data-open]').click()
    assert page.locator('#receiptText').input_value()==TEXT
    assert page.locator('.item').count()==0
    if not BACKEND:context.set_offline(True)
    interpret()
    assert page.locator('.item').count()==3
    assert page.locator('#store').input_value()=='MERCADO DE TESTE LTDA'
    assert page.locator('#cnpj').input_value()=='11.222.333/0001-81'
    assert page.locator('#date').input_value()==''
    assert page.locator('#receiptTotal').input_value()=='79,19'
    assert page.locator('[data-field="unit"]').evaluate_all('(els)=>els.map(e=>e.value)')==['UN','KG','PCT']
    assert page.locator('#subtotal').inner_text().replace('\xa0',' ')=='R$ 79,19'
    page.locator('#date').fill('2026-10-26')
    page.locator('#confirm').click()
    assert 'chave de acesso' in page.locator('#notice').inner_text()
    page.locator('#key').fill(KEY1[:-1]+'5')
    page.locator('#confirm').click()
    assert 'verificador' in page.locator('#notice').inner_text()
    page.locator('#key').fill(' '.join(KEY1[n:n+4] for n in range(0,44,4)))
    interpret()
    assert page.locator('.item').count()==3,'Interpretar novamente duplicou itens'
    assert page.locator('.item[open]').count()==0,'Itens válidos ficaram abertos para revisão obrigatória'
    paste(TEXT.replace('itens: 3','itens: 4'))
    interpret()
    page.locator('#date').fill('2026-10-26')
    page.locator('#confirm').click()
    assert 'lista contém 3' in page.locator('#notice').inner_text()
    paste(TEXT)
    interpret()
    paste('')
    page.locator('#confirm').click()
    assert 'texto foi alterado' in page.locator('#notice').inner_text()
    paste('Texto sem produtos')
    interpret()
    assert page.locator('.item').count()==3,'Texto sem produtos apagou itens'
    paste(TEXT+'\n')
    page.locator('#date').fill('2026-10-26')
    page.locator('#confirm').click()
    assert 'texto foi alterado' in page.locator('#notice').inner_text()
    interpret()
    page.locator('#receiptTotal').fill('79,20')
    page.locator('#confirm').click()
    assert 'difere' in page.locator('#notice').inner_text()
    page.locator('#receiptTotal').fill('79,19')
    page.locator('#confirm').click()
    page.wait_for_function("!document.getElementById('listView').hidden")
    context.set_offline(False)
    page.reload();page.locator('[data-open]').click()
    assert page.locator('#stateBadge').inner_text()=='Registrada'
    assert page.locator('#key').input_value()==KEY1
    assert page.evaluate('purchase.fiscalValidation.authenticity')=='not_checked'
    assert page.locator('.item').count()==3
    assert page.evaluate('purchase.items[1].unitRaw')=='KG9'
    assert page.locator('#receiptText').input_value()==TEXT+'\n'
    page.set_viewport_size({'width':390,'height':844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path='/tmp/rip-text-mobile.png',full_page=True)
    page.locator('#back').click()
    if not BACKEND:
     with page.expect_download() as info:page.locator('#exportBackup').click()
     backup=Path(temp)/'backup.json';info.value.save_as(backup)
     data=json.loads(backup.read_text());assert data['purchases'][0]['receiptText']==TEXT+'\n'
     await_clear="async()=>{const db=await localDB;await new Promise(r=>{const t=db.transaction(['purchases','images'],'readwrite');t.objectStore('purchases').clear();t.objectStore('images').clear();t.oncomplete=r})}"
     page.evaluate(await_clear);page.reload()
     page.get_by_text('Seu primeiro cupom é o começo.').wait_for()
     page.locator('#importBackup').set_input_files(str(backup))
     page.locator('[data-open]').wait_for();page.locator('[data-open]').click()
     assert page.locator('.item').count()==3
     assert page.locator('#stateBadge').inner_text()=='Registrada'
     page.locator('#back').click()
     image={'id':'b'*64+'.png','data':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII='}
     legacy={'id':'a'*32,'status':'draft','store':'MERCADO ANTIGO','date':'2026-10-25','receiptTotal':'5,00','discount':'0,00','extra':'0,00','items':[{'description':'ITEM LEGADO','quantity':'1','unit':'UN','unitPrice':'5,00','discount':'0,00','total':'5,00','source':image['id']}],'images':[{'image':image['id'],'name':'antiga.png','text':'texto antigo','processed':True}]}
     legacyfile=Path(temp)/'legacy.json';legacyfile.write_text(json.dumps({'format':'rip-desktop','version':1,'purchases':[legacy],'images':[image]}))
     page.locator('#importBackup').set_input_files(str(legacyfile))
     page.locator('[data-open="'+'a'*32+'"]').click()
     page.locator('#textDetails').evaluate('(el)=>el.open=true')
     assert page.locator('#legacyNotice').is_visible()
     assert page.locator('.item').count()==1
     page.locator('#save').click()
     page.wait_for_function("!document.getElementById('listView').hidden")
     with page.expect_download() as info:page.locator('#exportBackup').click()
     legacyexport=Path(temp)/'export.json';info.value.save_as(legacyexport)
     exported=json.loads(legacyexport.read_text())
     assert exported['images'][0]['data']==image['data']
     assert next(x for x in exported['purchases'] if x['id']==legacy['id'])['images']==legacy['images']
    # Ajustes explícitos são importados; alterações manuais não são sobrescritas.
    page.locator('#newPurchase').click()
    adjustment='MERCADO TESTE\nCNPJ: 11.222.333/0001-81\nPRODUTO (Código: 1)\nQtde.: 1 UN: UN Vl. Unit.: 10,00\nVl. Total\n9,50\nDesconto do item: 0,50\nQtd. total de itens: 1\nDescontos R$: 1,00\nAcréscimos R$: 0,25\nValor a pagar R$: 8,75'
    adjustment+='\nChave de acesso:\n'+KEY2
    paste(adjustment);interpret()
    assert page.locator('#key').input_value()==KEY2
    assert page.locator('#discount').input_value()=='1,00'
    assert page.locator('#extra').input_value()=='0,25'
    assert page.locator('#adjustments').evaluate('(el)=>el.open')
    assert page.locator('[data-field="discount"]').input_value()=='0,50'
    no_adjustment=adjustment.replace('Descontos R$: 1,00\nAcréscimos R$: 0,25\n','').replace('8,75','9,50')
    paste(no_adjustment);interpret()
    assert page.locator('#discount').input_value()=='0,00'
    assert page.locator('#extra').input_value()=='0,00'
    page.locator('#adjustments').evaluate('(el)=>el.open=true')
    page.locator('#discount').fill('0,75')
    paste(adjustment);interpret()
    assert page.locator('#discount').input_value()=='0,75'
    page.locator('#discount').fill('1,00')
    page.locator('#date').fill('2026-10-26')
    assert 'Pronta para salvar' in page.locator('#reconstructionSummary').inner_text()
    page.locator('#key').fill(KEY1)
    page.locator('#confirm').click()
    page.wait_for_function("document.getElementById('notice').textContent.toLowerCase().includes('já existe')")
    assert 'já existe' in page.locator('#notice').inner_text().lower()
    page.locator('#key').fill(KEY2)
    page.locator('#confirm').click()
    page.wait_for_function("!document.getElementById('listView').hidden")
    # Excluir uma nota salva permite cancelar, atualiza totais e persiste a remoção.
    target=page.evaluate("purchases.find(p=>p.store==='MERCADO TESTE').id")
    before=int(page.locator('#count').inner_text())
    page.locator(f'[data-open="{target}"]').click()
    page.remove_listener('dialog',accept_dialog)
    page.once('dialog',lambda d:d.dismiss())
    page.locator('#deletePurchase').click()
    assert page.locator('#editorView').is_visible()
    assert page.evaluate('purchase.id')==target
    page.on('dialog',accept_dialog)
    page.locator('#deletePurchase').click()
    page.wait_for_function("!document.getElementById('listView').hidden")
    assert int(page.locator('#count').inner_text())==before-1
    assert page.locator('#sum').inner_text().replace('\xa0',' ')=='R$ 79,19'
    page.reload();page.locator('#count').wait_for()
    page.wait_for_function('(count)=>Number(document.getElementById("count").textContent)===count',arg=before-1)
    assert page.locator(f'[data-open="{target}"]').count()==0
    if not BACKEND:
     # Anexos históricos compartilhados só saem quando a última nota for excluída.
     copy=dict(legacy,id='c'*32,store='OUTRA NOTA ANTIGA')
     sharedfile=Path(temp)/'shared.json';sharedfile.write_text(json.dumps({'format':'rip-desktop','version':1,'purchases':[copy],'images':[image]}))
     page.locator('#importBackup').set_input_files(str(sharedfile))
     page.locator('[data-open="'+'c'*32+'"]').wait_for()
     for ident,remaining_images in [('a'*32,1),('c'*32,0)]:
      page.locator(f'[data-open="{ident}"]').click()
      page.locator('#deletePurchase').click()
      page.wait_for_function("!document.getElementById('listView').hidden")
      assert page.evaluate("async()=>(await readAll('images')).length")==remaining_images
     with page.expect_download() as info:page.locator('#exportBackup').click()
     finalbackup=Path(temp)/'after-deletion.json';info.value.save_as(finalbackup)
     finaldata=json.loads(finalbackup.read_text())
     assert len(finaldata['purchases'])==1
     assert finaldata['images']==[]
    assert not external,external
    assert not errors,errors
    browser.close()
    print('PASS:', 'SQLite' if BACKEND else 'Vercel estática/offline e backups legados', 'texto colado, unidades normalizadas, sem imagens/OCR/requests externos, reinterpretação sem duplicar, validação, persistência e celular.')
  finally:
   server.terminate();server.wait(timeout=10)

if __name__=='__main__':main()
