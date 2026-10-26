"""OCR real no layout em colunas, com captura sintética e dados anônimos."""
import atexit
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import urllib.request
from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
products=[['BEBIDA CITRICA 1LT','1','UN','3,99','3,99'],['FRANGO COXA KG','1,208','KG','13,99','16,90'],['MARGARINA 250G','1','UN','2,99','2,99'],['QUEIJO MUSSARELA KG','0,328','KG','54,99','18,04'],['PRESUNTO KG','0,314','KG','29,99','9,42'],['CARNE SUINA KG','1,068','KG','20,99','22,42'],['CARA KG','1,17','KG','4,99','5,84'],['FILE DE PEITO KG','1,058','KG','25,99','27,50'],['SHAMPOO INFANTIL 400ML','1','UN','30,69','30,69'],['PAO INTEGRAL 480G','1','UN','13,49','13,49']]
server=subprocess.Popen([sys.executable,'-m','http.server','8004','--bind','127.0.0.1','--directory',str(ROOT)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
atexit.register(server.terminate)
for _ in range(50):
    try:
        urllib.request.urlopen('http://127.0.0.1:8004/RIP.html',timeout=1)
        break
    except OSError:
        time.sleep(.1)

with tempfile.TemporaryDirectory(prefix='rip-columns-') as temp, sync_playwright() as p:
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',11)
    bold=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',11)
    image=Image.new('RGB',(547,700),'#d8d8d8')
    draw=ImageDraw.Draw(image)
    draw.rectangle((21,7,530,690),fill='white')
    blue='#5298cf'
    draw.text((170,15),'Supermercado de teste',font=bold,fill=blue)
    draw.text((180,36),'CNPJ: 11.222.333/0001-81',font=font,fill='black')
    for n,(name,qty,unit,price,total) in enumerate(products):
        y=102+n*40
        draw.rectangle((26,y,525,y+39),fill='#eee' if n%2==0 else 'white')
        draw.text((30,y+4),f'{name} (Código: {100+n})',font=font,fill=blue)
        draw.text((477,y+4),'Vl. Total',font=font,fill=blue)
        draw.text((30,y+18),f'Qtde.: {qty}  UN: {unit}  Vl. Unit.: {price}',font=font,fill=blue)
        draw.text((520,y+18),total,font=bold,fill=blue,anchor='ra')
    draw.text((294,520),'Qtd. total de itens:',font=font,fill=blue)
    draw.text((510,520),'10',font=font,fill='black')
    draw.text((300,545),'Valor a pagar R$:',font=bold,fill=blue)
    draw.text((476,545),'151,28',font=bold,fill=blue)
    draw.text((290,590),'Forma de pagamento:',font=font,fill=blue)
    draw.text((390,615),'Cartão de Crédito',font=font,fill='black')
    path=Path(temp)/'cupom-sintetico.png';image.save(path)
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000})
    page.on('dialog',lambda dialog:dialog.accept())
    page.goto('http://127.0.0.1:8004/RIP.html')
    page.locator('#newPurchase').click()
    page.locator('#files').set_input_files(str(path))
    page.locator('.thumb').wait_for()
    page.locator('#process').click()
    page.wait_for_function("document.getElementById('progress').textContent.startsWith('Extração concluída') || (!document.getElementById('notice').hidden && document.getElementById('notice').classList.contains('error'))",timeout=150000)
    text=page.evaluate('images[0].text')
    Path('/tmp/rip-column-ocr.txt').write_text(text or '')
    result=page.evaluate('purchase.items')
    print('OCR real concluído; texto diagnóstico em /tmp/rip-column-ocr.txt',flush=True)
    print('Itens reconstruídos:',len(result),flush=True)
    assert len(result)==10, f'Esperados 10 itens, recebidos {len(result)}'
    for item,expected in zip(result,products):
        assert [item['quantity'],item['unit'],item['unitPrice'],item['total']]==expected[1:],(item,expected)
    assert page.locator('#receiptTotal').input_value()=='151,28'
    assert page.locator('#subtotal').inner_text().replace('\xa0',' ')=='R$ 151,28'
    assert page.locator('#store').input_value()=='Supermercado de teste'
    assert page.locator('#cnpj').input_value()=='11.222.333/0001-81'
    assert page.locator('#date').input_value()==''
    page.locator('#store').fill('Mercado conferido manualmente')
    # Reconstrução do texto não deve repetir itens nem apagar outras imagens.
    page.locator('#ocrTexts > details > summary').click()
    page.locator('[data-edit-text]').fill('Texto ilegível sem produto ou valores')
    page.locator('[data-rebuild]').click()
    assert page.locator('.item').count()==10, 'Uma tentativa sem itens apagou a revisão anterior'
    # Quando não há itens novos, os anteriores são preservados e a seção pode fechar.
    page.locator('#ocrTexts > details').evaluate('(el)=>el.open=true')
    page.locator('[data-edit-text]').fill(text.replace('BEBIDA','BEBIDA CORRIGIDA'))
    page.locator('[data-rebuild]').click()
    assert page.locator('.item').count()==10
    assert 'CORRIGIDA' in page.locator('[data-field="description"]').first.input_value()
    assert page.locator('#store').input_value()=='Mercado conferido manualmente'
    page.locator('#date').fill('2026-10-26')
    page.locator('#reviewed').check()
    page.locator('#confirm').click()
    page.wait_for_function("!document.getElementById('listView').hidden")
    assert page.locator('#pending').inner_text()=='0'
    page.locator('[data-open]').click()
    assert page.locator('#store').input_value()=='Mercado conferido manualmente'
    assert page.locator('#cnpj').input_value()=='11.222.333/0001-81'
    assert 'CORRIGIDA' in page.locator('[data-field="description"]').first.input_value()
    page.screenshot(path='/tmp/rip-columns-review.png',full_page=True)
    browser.close()
    print('PASS: captura sintética no layout de colunas, 10 itens, total R$ 151,28, reconstrução sem duplicar e confirmação persistida.')
