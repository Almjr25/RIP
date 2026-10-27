"""UI cloud com respostas simuladas: nenhuma conta/e-mail/dado real é criado."""
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
URL='http://127.0.0.1:8011'
LOCAL={'id':'a'*32,'status':'draft','store':'Histórico local sintético','items':[],'images':[],'receiptText':'Texto local preservado'}

def main():
    subprocess.run(['node','scripts/build_portable.mjs','--vercel'],cwd=ROOT,env={**os.environ,'RIP_CLOUD_ENABLED':'true'},check=True)
    server=subprocess.Popen(['python3','-m','http.server','8011','--bind','127.0.0.1','--directory','dist'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        time.sleep(.3)
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            page=browser.new_page()
            state={'user':None,'data':{},'saved':0,'recovered':False}
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            def route(r):
                req=r.request; path=urlparse(req.url).path; query=parse_qs(urlparse(req.url).query)
                body=req.post_data_json if req.method=='POST' else None
                code=200; value={}
                if path=='/api/auth/login':
                    state['user']={'id':body['email'],'email':body['email']};value={'user':state['user']}
                elif path=='/api/auth/status':
                    if state['user']:value={'user':state['user']}
                    else:code=401;value={'error':'Entre na sua conta para continuar.'}
                elif path=='/api/auth/signup':value={'message':'Confira seu e-mail para confirmar a conta.'}
                elif path=='/api/auth/recover':state['recovered']=True;value={'message':'Você receberá o link de recuperação.'}
                elif path=='/api/auth/password':value={'ok':True}
                elif path=='/api/auth/logout':state['user']=None;value={'ok':True}
                elif not state['user']:code=401;value={'error':'Entre na sua conta.'}
                else:
                    assert req.headers.get('x-rip-account')==state['user']['id']
                    records=state['data'].setdefault(state['user']['id'],{})
                    if path=='/api/stats':value={'count':len(records),'pending':sum(x['status']=='draft' for x in records.values()),'totalCents':0}
                    elif path=='/api/purchases' and req.method=='GET':
                        if 'id' in query:value=records[query['id'][0]]
                        else:value={'rows':[{**x,'items':[],'_summary':True,'itemCount':len(x['items'])} for x in records.values()],'hasMore':False}
                    elif path=='/api/purchases' and req.method=='POST':
                        note={**body,'id':body.get('id','b'*32),'_revision':1,'images':[]};records[note['id']]=note;state['saved']+=1;value=note
                    elif path=='/api/purchases/delete':del records[body['id']];value={'deleted':body['id']}
                r.fulfill(status=code,content_type='application/json',body=json.dumps(value))
            page.route('**/api/**',route)
            page.goto(URL)
            page.wait_for_selector('#authForm:visible')
            assert not page.locator('#listView').is_visible()
            assert not page.locator('#editorView').is_visible()
            page.locator('#authEmail').fill('alice@example.com')
            page.locator('#authPassword').fill('syntheticpassword')
            page.locator('#signup').click()
            page.wait_for_function("document.querySelector('#accountMessage').textContent.includes('Confira')")
            page.locator('#recover').click()
            page.wait_for_function("document.querySelector('#accountMessage').textContent.includes('recuperação')")
            assert state['recovered']
            # Local records already existed before activation: importing is explicit.
            page.evaluate('p=>writeLocal("purchases",p)',LOCAL)
            page.locator('#authPassword').fill('syntheticpassword')
            page.locator('#authForm button[type=submit]').click()
            page.wait_for_selector('#migrateLocal:visible')
            assert state['saved']==0
            assert page.locator('#count').inner_text()=='0'
            page.once('dialog',lambda d:d.accept())
            page.locator('#migrateLocal').click()
            page.wait_for_function("document.querySelector('#accountMessage').textContent.includes('1 copiadas')")
            assert page.locator('#count').inner_text()=='1'
            assert page.evaluate('async()=> (await readAll("purchases")).length')==1
            # Repeating import cannot overwrite an existing cloud record.
            page.once('dialog',lambda d:d.accept())
            page.locator('#migrateLocal').click()
            page.wait_for_function("document.querySelector('#accountMessage').textContent.includes('1 já existentes')")
            assert state['saved']==1
            page.locator('[data-open]').click()
            page.wait_for_selector('#editorView:visible')
            assert page.locator('#receiptText').input_value()=='Texto local preservado'
            page.locator('#receiptText').fill('Rascunho na nuvem')
            page.locator('#save').click()
            page.wait_for_selector('#listView:visible')
            assert state['saved']==2
            page.locator('#changePassword').click()
            page.locator('#newPassword').fill('another-test-password')
            page.locator('#passwordForm button').click()
            page.wait_for_function("document.querySelector('#accountMessage').textContent.includes('Senha alterada')")
            with page.expect_download() as downloaded:page.locator('#exportBackup').click()
            assert downloaded.value.suggested_filename=='RIP-conta-backup.json'
            page.locator('#logout').click()
            page.wait_for_selector('#authForm:visible')
            assert page.locator('#receiptText').input_value()==''
            assert page.locator('#purchaseList').inner_text()==''
            page.locator('#authEmail').fill('bob@example.com')
            page.locator('#authPassword').fill('syntheticpassword')
            page.locator('#authForm button[type=submit]').click()
            page.wait_for_selector('#accountTools:visible')
            page.wait_for_function("document.querySelector('#count').textContent==='0'")
            assert 'Histórico local sintético' not in page.locator('#purchaseList').inner_text()
            page.set_viewport_size({'width':390,'height':844})
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            assert not errors, errors
            browser.close()
            print('PASS: login, confirmação/recuperação, importação explícita sem duplicar, edição, backup, saída, outra conta e celular; API simulada.')
    finally:
        server.terminate();server.wait()
        subprocess.run(['node','scripts/build_portable.mjs','--vercel'],cwd=ROOT,env={**os.environ,'RIP_CLOUD_ENABLED':'false'},check=True)

if __name__=='__main__':main()
