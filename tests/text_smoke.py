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
    page.on('dialog',lambda d:d.accept())
    page.goto(URL)
    assert page.locator('input[accept*="image"]').count()==0
    page.locator('#newPurchase').click()
    page.locator('#receiptText').fill(TEXT)
    page.locator('#save').click()
    page.wait_for_function("!document.getElementById('listView').hidden")
    page.locator('[data-open]').click()
    assert page.locator('#receiptText').input_value()==TEXT
    assert page.locator('.item').count()==0
    if not BACKEND:context.set_offline(True)
    page.locator('#process').click()
    assert page.locator('.item').count()==3
    assert page.locator('#store').input_value()=='MERCADO DE TESTE LTDA'
    assert page.locator('#cnpj').input_value()=='11.222.333/0001-81'
    assert page.locator('#date').input_value()==''
    assert page.locator('#receiptTotal').input_value()=='79,19'
    assert page.locator('[data-field="unit"]').evaluate_all('(els)=>els.map(e=>e.value)')==['UN','KG','PCT']
    assert page.locator('#subtotal').inner_text().replace('\xa0',' ')=='R$ 79,19'
    page.locator('#process').click()
    assert page.locator('.item').count()==3,'Interpretar novamente duplicou itens'
    page.locator('#receiptText').fill('')
    page.locator('#reviewed').check();page.locator('#confirm').click()
    assert 'texto foi alterado' in page.locator('#notice').inner_text()
    page.locator('#receiptText').fill('Texto sem produtos')
    page.locator('#process').click()
    assert page.locator('.item').count()==3,'Texto sem produtos apagou itens'
    page.locator('#receiptText').fill(TEXT+'\n')
    page.locator('#date').fill('2026-10-26')
    page.locator('#reviewed').check()
    page.locator('#confirm').click()
    assert 'texto foi alterado' in page.locator('#notice').inner_text()
    page.locator('#process').click()
    page.locator('#receiptTotal').fill('79,20')
    page.locator('#reviewed').check();page.locator('#confirm').click()
    assert 'Confira' in page.locator('#notice').inner_text()
    page.locator('#receiptTotal').fill('79,19')
    page.locator('#reviewed').check();page.locator('#confirm').click()
    page.wait_for_function("!document.getElementById('listView').hidden")
    context.set_offline(False)
    page.reload();page.locator('[data-open]').click()
    assert page.locator('#stateBadge').inner_text()=='Conferida'
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
     assert page.locator('#stateBadge').inner_text()=='Conferida'
     page.locator('#back').click()
     image={'id':'b'*64+'.png','data':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII='}
     legacy={'id':'a'*32,'status':'draft','store':'MERCADO ANTIGO','date':'2026-10-25','receiptTotal':'5,00','discount':'0,00','extra':'0,00','items':[{'description':'ITEM LEGADO','quantity':'1','unit':'UN','unitPrice':'5,00','discount':'0,00','total':'5,00','source':image['id']}],'images':[{'image':image['id'],'name':'antiga.png','text':'texto antigo','processed':True}]}
     legacyfile=Path(temp)/'legacy.json';legacyfile.write_text(json.dumps({'format':'rip-desktop','version':1,'purchases':[legacy],'images':[image]}))
     page.locator('#importBackup').set_input_files(str(legacyfile))
     page.locator('[data-open="'+'a'*32+'"]').click()
     assert page.locator('#legacyNotice').is_visible()
     assert page.locator('.item').count()==1
     page.locator('#save').click()
     page.wait_for_function("!document.getElementById('listView').hidden")
     with page.expect_download() as info:page.locator('#exportBackup').click()
     legacyexport=Path(temp)/'export.json';info.value.save_as(legacyexport)
     exported=json.loads(legacyexport.read_text())
     assert exported['images'][0]['data']==image['data']
     assert next(x for x in exported['purchases'] if x['id']==legacy['id'])['images']==legacy['images']
    assert not external,external
    assert not errors,errors
    browser.close()
    print('PASS:', 'SQLite' if BACKEND else 'Vercel estática/offline e backups legados', 'texto colado, unidades normalizadas, sem imagens/OCR/requests externos, reinterpretação sem duplicar, validação, persistência e celular.')
  finally:
   server.terminate();server.wait(timeout=10)

if __name__=='__main__':main()
