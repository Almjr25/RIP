"""Abre RIP.html via file:// e testa armazenamento e OCR reais no navegador."""
from pathlib import Path
import tempfile
import subprocess
import sys
import time
import atexit
import urllib.request
import os
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
STATIC_ROOT = Path(os.environ.get('RIP_STATIC_DIR', ROOT))
PAGE_PATH = os.environ.get('RIP_STATIC_PATH', '/RIP.html')
# O Chromium gerenciado deste ambiente bloqueia file:// por política.
# Sirva apenas arquivos estáticos para testar a mesma aplicação sem backend.
server = subprocess.Popen([sys.executable, '-m', 'http.server', '8003', '--bind', '127.0.0.1', '--directory', str(STATIC_ROOT)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
atexit.register(server.terminate)
for _ in range(50):
    try:
        urllib.request.urlopen('http://127.0.0.1:8003'+PAGE_PATH, timeout=1)
        break
    except OSError:
        time.sleep(.1)

with tempfile.TemporaryDirectory(prefix='rip-html-') as temp, sync_playwright() as p:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 32)
    paths = []
    for n, text in enumerate(['ARROZ 2 UN x 7,50 15,00', 'LEITE 1 UN x 5,00 5,00']):
        image = Image.new('RGB', (1000, 220), 'white')
        ImageDraw.Draw(image).text((30, 70), text, font=font, fill='black')
        path = Path(temp) / f'{n}.png'
        image.save(path)
        paths.append(str(path))
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(accept_downloads=True)
    errors = []
    backend_requests = []
    page.on('request', lambda request: backend_requests.append(request.url) if '/api/' in request.url else None)
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('requestfailed',lambda request: print('REDE:',request.url,request.failure,flush=True))
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto('http://127.0.0.1:8003'+PAGE_PATH)
    page.locator('#newPurchase').click()
    page.locator('#files').set_input_files(paths)
    page.locator('.thumb').nth(1).wait_for()
    page.locator('#save').click()
    page.wait_for_function("!document.getElementById('listView').hidden")
    page.reload()
    page.locator('[data-open]').click()
    assert page.locator('.thumb').count() == 2
    assert page.locator('.item').count() == 0
    page.locator('#process').click()
    page.wait_for_function("document.getElementById('progress').textContent.startsWith('Extração concluída') || (!document.getElementById('notice').hidden && document.getElementById('notice').classList.contains('error'))", timeout=150000)
    assert page.locator('.item').count() == 2, page.locator('#notice').inner_text()+' '+page.locator('#progress').inner_text()
    page.locator('#store').fill('Mercado HTML')
    page.locator('#date').fill('2026-10-26')
    page.locator('#receiptTotal').fill('21,00')
    page.locator('#reviewed').check()
    page.locator('#confirm').click()
    assert 'Confira' in page.locator('#notice').inner_text()
    page.locator('#receiptTotal').fill('20,00')
    page.locator('#reviewed').check()
    page.locator('#confirm').click()
    page.wait_for_function("!document.getElementById('listView').hidden")
    with page.expect_download() as info:
        page.locator('#exportBackup').click()
    backup = Path(temp) / 'backup.json'
    info.value.save_as(backup)
    assert 'Mercado HTML' in backup.read_text()
    page.evaluate("async()=>{const db=await localDB;await new Promise(r=>{const t=db.transaction(['purchases','images'],'readwrite');t.objectStore('purchases').clear();t.objectStore('images').clear();t.oncomplete=r})}")
    page.reload()
    page.get_by_text('Seu primeiro cupom é o começo.').wait_for()
    page.locator('#importBackup').set_input_files(str(backup))
    page.locator('[data-open]').wait_for()
    page.locator('[data-open]').click()
    assert page.locator('.item').count() == 2
    assert page.locator('.thumb').count() == 2
    assert page.locator('#stateBadge').inner_text() == 'Conferida'
    page.screenshot(path='/tmp/rip-html.png', full_page=True)
    assert not errors, errors
    assert not backend_requests, backend_requests
    browser.close()
    print('PASS: HTML estático sem API/backend, dois prints, OCR real em português no navegador, IndexedDB, divergência bloqueada, confirmação, exportação e restauração de backup completo.')
