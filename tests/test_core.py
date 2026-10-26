import unittest
from server import cents, reconcile


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



if __name__ == '__main__':
    unittest.main()
