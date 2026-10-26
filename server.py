"""RIP: servidor local com persistência SQLite para cupons copiados como texto."""
import json
import os
import re
import sqlite3
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = Path(os.environ.get('RIP_DATA_DIR', ROOT / '.data'))
DATA.mkdir(parents=True, exist_ok=True)
(DATA / 'images').mkdir(exist_ok=True)


def db():
    c = sqlite3.connect(DATA / 'rip.sqlite3')
    c.execute('PRAGMA foreign_keys=ON')
    c.execute('CREATE TABLE IF NOT EXISTS purchases (id TEXT PRIMARY KEY, body TEXT NOT NULL, updated TEXT DEFAULT CURRENT_TIMESTAMP)')
    columns = {row[1] for row in c.execute('PRAGMA table_info(purchases)')}
    for name, kind in [('store', 'TEXT'), ('purchase_date', 'TEXT'), ('status', 'TEXT'), ('receipt_total_cents', 'INTEGER'), ('fiscal_key', 'TEXT')]:
        if name not in columns:
            c.execute(f'ALTER TABLE purchases ADD COLUMN {name} {kind}')
    c.execute('CREATE UNIQUE INDEX IF NOT EXISTS fiscal_key_unique ON purchases(fiscal_key) WHERE fiscal_key IS NOT NULL')
    c.execute('CREATE TABLE IF NOT EXISTS purchase_items (purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE, position INTEGER NOT NULL, description TEXT NOT NULL, quantity_decimal TEXT, unit TEXT, unit_price_decimal TEXT, discount_cents INTEGER, total_cents INTEGER, source_image TEXT, PRIMARY KEY(purchase_id, position))')
    c.execute('CREATE TABLE IF NOT EXISTS purchase_images (purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE, position INTEGER NOT NULL, image TEXT NOT NULL, original_name TEXT, ocr_text TEXT, PRIMARY KEY(purchase_id, position))')
    c.commit()
    return c


def optional_cents(value):
    try:
        return cents(value)
    except (ValueError, InvalidOperation):
        return None


def number(value):
    s = str(value).strip().replace('R$', '').replace(' ', '')
    if ',' in s:
        s = s.replace('.', '').replace(',', '.')
    n = Decimal(s)
    if not n.is_finite() or n < 0:
        raise ValueError('Use valores positivos e finitos.')
    return n


def cents(value):
    return int((number(value) * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def reconcile(p):
    items = p.get('items', [])
    if not items:
        raise ValueError('Adicione pelo menos um item.')
    subtotal = 0
    for item in items:
        if not str(item.get('description', '')).strip():
            raise ValueError('Todo item precisa de descrição.')
        q = number(item['quantity'])
        if q <= 0:
            raise ValueError('A quantidade deve ser maior que zero.')
        expected = int((q * number(item['unitPrice']) * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP)) - cents(item.get('discount', '0'))
        actual = cents(item['total'])
        if expected < 0 or abs(expected - actual) > 1:
            raise ValueError('Confira quantidade, preço e desconto de cada item (tolerância de arredondamento: R$ 0,01).')
        subtotal += actual
    total = subtotal - cents(p.get('discount', '0')) + cents(p.get('extra', '0'))
    difference = total - cents(p['receiptTotal'])
    if total < 0:
        raise ValueError('O total calculado não pode ser negativo.')
    return {'subtotal': subtotal, 'total': total, 'difference': difference}


def validate_purchase(p):
    result = reconcile(p)
    if result['difference'] != 0:
        raise ValueError('A soma dos itens e ajustes difere do total da nota.')
    if not str(p.get('store', '')).strip():
        raise ValueError('Informe o estabelecimento.')
    try:
        date.fromisoformat(p.get('date', ''))
    except (ValueError, TypeError):
        raise ValueError('Informe uma data válida.')
    if any(not str(item.get('unit', '')).strip() for item in p['items']):
        raise ValueError('Há itens sem unidade.')
    expected = p.get('analysis', {}).get('expectedCount')
    if type(expected) is int and expected != len(p['items']):
        raise ValueError('A quantidade de itens difere da informada no texto.')
    text, parsed = p.get('receiptText', ''), p.get('parsedText', '')
    if (parsed and text != parsed) or (text.strip() and not parsed):
        raise ValueError('Interprete o texto alterado antes de salvar a compra.')
    cnpj = re.sub(r'\D', '', p.get('cnpj', ''))
    if p.get('cnpj'):
        def check(part):
            weights = ([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] if len(part) == 12 else [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
            remainder = sum(int(x) * w for x, w in zip(part, weights)) % 11
            return str(0 if remainder < 2 else 11 - remainder)
        if len(cnpj) != 14 or len(set(cnpj)) == 1 or cnpj[12] != check(cnpj[:12]) or cnpj[13] != check(cnpj[:13]):
            raise ValueError('O CNPJ informado é inválido.')
    return result


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'web'), **kwargs)

    def reply(self, value, status=200):
        raw = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == '/api/purchases':
            with db() as c:
                return self.reply([json.loads(x[0]) for x in c.execute('SELECT body FROM purchases ORDER BY updated DESC')])
        if self.path.startswith('/api/images/'):
            name = self.path.rsplit('/', 1)[-1]
            if not re.fullmatch(r'[a-f0-9]{64}\.png', name):
                return self.send_error(404)
            path = DATA / 'images' / name
            if not path.exists():
                return self.send_error(404)
            self.send_response(200)
            self.send_header('Content-Type', 'image/png')
            self.end_headers()
            self.wfile.write(path.read_bytes())
            return
        return super().do_GET()

    def do_POST(self):
        try:
            # Browser requests must originate from this app, not another website.
            origin = self.headers.get('Origin')
            if origin and origin != 'http://' + self.headers.get('Host', '') and origin != 'https://' + self.headers.get('Host', ''):
                return self.reply({'error': 'Origem não permitida.'}, 403)
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= 30 * 1024 * 1024:
                return self.reply({'error': 'Envie até 30 MB por requisição.'}, 413)
            p = json.loads(self.rfile.read(size))
            if self.path == '/api/purchases':
                if p.get('status') not in ('draft', 'confirmed'):
                    raise ValueError('Estado inválido.')
                ident = p.get('id') or uuid.uuid4().hex
                if not re.fullmatch(r'[a-f0-9]{32}', ident):
                    raise ValueError('Identificação inválida.')
                if p['status'] == 'confirmed':
                    validate_purchase(p)
                key = re.sub(r'\D', '', p.get('key', ''))
                if key and len(key) != 44:
                    raise ValueError('A chave fiscal deve ter 44 dígitos ou ficar vazia.')
                p['key'] = key
                p['id'] = ident
                with db() as c:
                    for row in c.execute('SELECT body FROM purchases WHERE id != ?', (ident,)):
                        old = json.loads(row[0])
                        if key and old.get('key') == key:
                            raise ValueError('Já existe uma compra com esta chave fiscal.')
                    previous = c.execute('SELECT body FROM purchases WHERE id=?', (ident,)).fetchone()
                    history = json.loads(previous[0]).get('history', []) if previous else []
                    if previous:
                        snapshot = json.loads(previous[0]); snapshot.pop('history', None)
                        history.append(snapshot)
                    p['history'] = history
                    c.execute('INSERT INTO purchases(id,body,store,purchase_date,status,receipt_total_cents,fiscal_key) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,store=excluded.store,purchase_date=excluded.purchase_date,status=excluded.status,receipt_total_cents=excluded.receipt_total_cents,fiscal_key=excluded.fiscal_key,updated=CURRENT_TIMESTAMP', (ident, json.dumps(p, ensure_ascii=False), p.get('store'), p.get('date'), p['status'], optional_cents(p.get('receiptTotal')), key or None))
                    c.execute('DELETE FROM purchase_items WHERE purchase_id=?', (ident,))
                    for n, item in enumerate(p.get('items', [])):
                        c.execute('INSERT INTO purchase_items VALUES(?,?,?,?,?,?,?,?,?)', (ident, n, item.get('description', ''), str(item.get('quantity', '')), item.get('unit'), str(item.get('unitPrice', '')), optional_cents(item.get('discount')), optional_cents(item.get('total')), item.get('source')))
                    c.execute('DELETE FROM purchase_images WHERE purchase_id=?', (ident,))
                    for n, im in enumerate(p.get('images', [])):
                        c.execute('INSERT INTO purchase_images VALUES(?,?,?,?,?)', (ident, n, im['image'], im.get('name'), im.get('text')))
                return self.reply(p)
            return self.reply({'error': 'Rota não encontrada.'}, 404)
        except (ValueError, KeyError, InvalidOperation, OSError) as e:
            return self.reply({'error': str(e) or 'Dados inválidos.'}, 400)


if __name__ == '__main__':
    host = os.environ.get('RIP_HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', '8000'))
    print(f'RIP iniciado na porta {port}', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
