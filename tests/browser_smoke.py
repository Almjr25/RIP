"""Teste funcional opcional: requer Playwright, Chromium e Pillow.

Usa um banco temporário; não adiciona compras fictícias ao banco do usuário.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.request

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def main():
    with tempfile.TemporaryDirectory(prefix='rip-smoke-') as temp:
        env = dict(os.environ, RIP_DATA_DIR=temp, PORT='8001')
        server = subprocess.Popen([sys.executable, str(ROOT / 'server.py')], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(50):
                try:
                    urllib.request.urlopen('http://127.0.0.1:8001/api/purchases', timeout=1)
                    break
                except OSError:
                    time.sleep(.1)
            font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 32)
            paths = []
            for n, line in enumerate(['ARROZ 2 UN x 7,50 15,00', 'LEITE 1 UN x 5,00 5,00']):
                image = Image.new('RGB', (1000, 220), 'white')
                ImageDraw.Draw(image).text((35, 70), line, font=font, fill='black')
                path = Path(temp) / f'captura-{n}.png'
                image.save(path)
                paths.append(str(path))
            with sync_playwright() as p:
                browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
                page = browser.new_page(viewport={'width': 1440, 'height': 1050})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto('http://127.0.0.1:8001')
                page.get_by_text('Seu primeiro cupom é o começo.').wait_for()
                page.screenshot(path='/tmp/rip-desktop.png', full_page=True)
                page.locator('#newPurchase').click()
                page.locator('#files').set_input_files(paths)
                page.locator('.thumb').nth(1).wait_for()
                assert page.locator('.item').count() == 0, 'OCR começou antes do comando do usuário'
                page.locator('#save').click()
                page.wait_for_function("!document.getElementById('listView').hidden")
                page.locator('[data-open]').click()
                assert page.locator('.thumb').count() == 2
                assert page.locator('.item').count() == 0, 'Rascunho executou OCR sem autorização'
                page.locator('#process').click()
                page.wait_for_function("document.getElementById('progress').textContent.startsWith('Extração concluída')", timeout=120000)
                assert page.locator('.item').count() == 2, page.locator('#ocrTexts').inner_text()
                page.locator('#store').fill('Mercado de teste')
                page.locator('#date').fill('2026-10-26')
                page.locator('#receiptTotal').fill('21,00')
                page.locator('#reviewed').check()
                page.locator('#confirm').click()
                assert 'Confira' in page.locator('#notice').inner_text()
                page.locator('#save').click()
                page.wait_for_function("!document.getElementById('listView').hidden")
                assert page.locator('#pending').inner_text() == '1'
                page.locator('[data-open]').click()
                assert page.locator('.item').count() == 2
                assert page.locator('.thumb').count() == 2
                page.locator('#receiptTotal').fill('20,00')
                page.locator('#reviewed').check()
                page.screenshot(path='/tmp/rip-review.png', full_page=True)
                page.locator('#confirm').click()
                page.wait_for_function("!document.getElementById('listView').hidden")
                assert page.locator('#pending').inner_text() == '0'
                assert page.locator('#sum').inner_text().replace('\xa0', ' ') == 'R$ 20,00'
                page.reload()
                page.locator('[data-open]').wait_for()
                page.locator('[data-open]').click()
                assert page.locator('#stateBadge').inner_text() == 'Conferida'
                page.set_viewport_size({'width': 390, 'height': 844})
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Overflow horizontal no celular'
                page.screenshot(path='/tmp/rip-mobile.png', full_page=True)
                payload = json.load(urllib.request.urlopen('http://127.0.0.1:8001/api/purchases'))[0]
                assert payload['history'], 'Histórico de edição ausente'
                payload['items'][0]['total'] = '99,00'
                request = urllib.request.Request('http://127.0.0.1:8001/api/purchases', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
                try:
                    urllib.request.urlopen(request)
                    raise AssertionError('API confirmou item inconsistente')
                except urllib.error.HTTPError as error:
                    assert error.code == 400
                assert not errors, errors
                browser.close()
                print('PASS: múltiplas imagens, OCR português, diferença bloqueada, rascunho, confirmação, persistência, histórico, validação na API e layout móvel.')
        finally:
            server.terminate()
            server.wait(timeout=10)


if __name__ == '__main__':
    main()
