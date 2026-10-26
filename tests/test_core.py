import unittest
from server import cents, extract, reconcile


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

    def test_overlap_not_silently_removed(self):
        text = 'ARROZ 2 UN x 7,50 15,00\nARROZ 2 UN x 7,50 15,00\nTexto incerto'
        items = extract(text, 'origin.png')
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]['source'], 'origin.png')

    def test_difference_preserved(self):
        p = {'items': [{'description': 'Leite', 'quantity': '2', 'unitPrice': '5,00', 'total': '10,00'}], 'receiptTotal': '10,50'}
        self.assertEqual(reconcile(p)['difference'], -50)

    def test_labelled_multiline_items(self):
        text = 'BANANA PRATA\n(Código: 123)\nQtde.: 0,750 UN: KG Vl. Unit.: 8,99\nVl. Total\n6,74'
        items = extract(text, 'captura.png')
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['description'], 'BANANA PRATA')
        self.assertEqual(items[0]['quantity'], '0,750')
        self.assertEqual(items[0]['total'], '6,74')


if __name__ == '__main__':
    unittest.main()
