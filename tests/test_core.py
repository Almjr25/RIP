import unittest
import tempfile
import json
from pathlib import Path
from unittest.mock import patch
import server
from server import cents, reconcile, validate_purchase


class ReceiptTests(unittest.TestCase):
    def test_brazilian_money(self):
        self.assertEqual(cents('1.234,56'), 123456)
        self.assertEqual(cents('0,10'), 10)

    def test_nonfinite_rejected(self):
        for value in ['NaN', 'Infinity', '-1']:
            with self.assertRaises(ValueError):
                cents(value)

    def test_weighted_item_and_discounts(self):
        p = {'items': [{'description': 'Banana', 'quantity': '0,750', 'unitPrice': '8,99', 'discount': '0,24', 'total': '6,50'}], 'discount': '0,50', 'extra': '0,10', 'receiptTotal': '6,10'}
        self.assertEqual(reconcile(p), {'subtotal': 650, 'total': 610, 'difference': 0})

    def test_compensating_errors_do_not_pass(self):
        p = {'items': [{'description': 'A', 'quantity': '1', 'unitPrice': '10,00', 'total': '11,00'}, {'description': 'B', 'quantity': '1', 'unitPrice': '10,00', 'total': '9,00'}], 'receiptTotal': '20,00'}
        with self.assertRaises(ValueError):
            reconcile(p)

    def test_difference_preserved(self):
        p = {'items': [{'description': 'Leite', 'quantity': '2', 'unitPrice': '5,00', 'total': '10,00'}], 'receiptTotal': '10,50'}
        self.assertEqual(reconcile(p)['difference'], -50)

    def test_save_without_manual_review_declaration(self):
        p = {'store': 'Mercado', 'date': '2026-10-26', 'items': [{'description': 'Leite', 'quantity': '2', 'unit': 'UN', 'unitPrice': '5,00', 'total': '10,00'}], 'receiptTotal': '10,00', 'analysis': {'expectedCount': 1}}
        self.assertEqual(validate_purchase(p)['difference'], 0)
        p['analysis']['expectedCount'] = 2
        with self.assertRaises(ValueError):
            validate_purchase(p)


class DeleteTests(unittest.TestCase):
    def test_delete_cascades_and_preserves_shared_attachments(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(server, 'DATA', Path(temp)):
            (Path(temp) / 'images').mkdir()
            shared, exclusive = 'b' * 64 + '.png', 'c' * 64 + '.png'
            for name in [shared, exclusive]:
                (Path(temp) / 'images' / name).write_bytes(b'legacy-image')
            for ident in ['a' * 32, 'd' * 32]:
                p = {'id': ident, 'images': [{'image': shared}], 'history': [{'images': [{'image': exclusive}]}] if ident.startswith('a') else []}
                with server.db() as c:
                    c.execute('INSERT INTO purchases(id,body) VALUES(?,?)', (ident, json.dumps(p)))
                    c.execute('INSERT INTO purchase_items VALUES(?,?,?,?,?,?,?,?,?)', (ident, 0, 'Item', '1', 'UN', '1,00', 0, 100, shared))
                    c.execute('INSERT INTO purchase_images VALUES(?,?,?,?,?)', (ident, 0, shared, 'antiga.png', 'texto'))
            self.assertEqual(server.delete_purchase('a' * 32)['deleted'], 'a' * 32)
            with server.db() as c:
                self.assertEqual(c.execute('SELECT count(*) FROM purchases').fetchone()[0], 1)
                self.assertEqual(c.execute('SELECT count(*) FROM purchase_items WHERE purchase_id=?', ('a' * 32,)).fetchone()[0], 0)
                self.assertEqual(c.execute('SELECT count(*) FROM purchase_images WHERE purchase_id=?', ('a' * 32,)).fetchone()[0], 0)
            self.assertTrue((Path(temp) / 'images' / shared).exists())
            self.assertFalse((Path(temp) / 'images' / exclusive).exists())
            server.delete_purchase('d' * 32)
            self.assertFalse((Path(temp) / 'images' / shared).exists())

    def test_invalid_or_missing_id_does_not_remove_other_notes(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(server, 'DATA', Path(temp)):
            with server.db() as c:
                c.execute('INSERT INTO purchases(id,body) VALUES(?,?)', ('a' * 32, '{"items":[]}'))
            for ident in ['../rip.sqlite3', 'b' * 32]:
                with self.assertRaises(ValueError):
                    server.delete_purchase(ident)
            with server.db() as c:
                self.assertEqual(c.execute('SELECT count(*) FROM purchases').fetchone()[0], 1)



if __name__ == '__main__':
    unittest.main()
