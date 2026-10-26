const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parse}=require('../web/receipt.js');

// Dados anônimos com a disposição em colunas apresentada pelo usuário.
const products=[
 ['BEBIDA CITRICA 1LT','1','UN','3,99','3,99'],
 ['FRANGO COXA KG','1,208','KG','13,99','16,90'],
 ['MARGARINA 250G','1','UN','2,99','2,99'],
 ['QUEIJO MUSSARELA KG','0,328','KG','54,99','18,04'],
 ['PRESUNTO KG','0,314','KG','29,99','9,42'],
 ['CARNE SUINA KG','1,068','KG','20,99','22,42'],
 ['CARA KG','1,17','KG','4,99','5,84'],
 ['FILE DE PEITO KG','1,058','KG','25,99','27,50'],
 ['SHAMPOO INFANTIL 400ML','1','UN','30,69','30,69'],
 ['PAO INTEGRAL 480G','1','UN','13,49','13,49']
];
const layout=products.map((p,n)=>`${p[0]} (Código: ${100+n}) Vl. Total\nQtde.: ${p[1]} UN: ${p[2]} Vl. Unit.: ${p[3]} ${p[4]}`).join('\n')+'\nQtd. total de itens: 10\nValor a pagar R$: 151,28\nForma de pagamento: Valor pago R$:\nCartão de Crédito 151,28';

test('layout em colunas: 10 itens, quantidades fracionadas e total observado',()=>{
 const r=parse(layout,'imagem.png');
 assert.equal(r.items.length,10);
 assert.equal(r.receiptTotal,'151,28');
 assert.equal(r.expectedCount,10);
 assert.deepEqual(r.warnings,[]);
 const ocr=parse(layout.replaceAll('Qtde.','Otde.').replaceAll('Vl.','VI.').replace('Qtd. total','Otd. total'),'imagem.png');
 assert.equal(ocr.items.length,10);assert.equal(ocr.expectedCount,10);assert.equal(ocr.receiptTotal,'151,28');
 for(let n=0;n<10;n++){
  const p=products[n],i=r.items[n];
  assert.deepEqual([i.description,i.quantity,i.unit,i.unitPrice,i.total],p);
  assert.equal(i.source,'imagem.png');
  assert.ok(i.rawText.includes('Qtde.'));
 }
 assert.equal(r.items.reduce((s,i)=>s+Math.round(Number(i.total.replace(',','.'))*100),0),15128);
});
test('total em linha isolada e rótulo acima da quantidade',()=>{
 const r=parse('ARROZ (Código: 7) Vl. Total\n15,00\nQtde.: 2 UN: UN Vl. Unit.: 7,50','a');
 assert.equal(r.items.length,1);assert.equal(r.items[0].total,'15,00');
});
test('campos rotulados sem código continuam sendo lidos',()=>{
 const r=parse('BANANA\nQtde.: 0,750 UN: KG Vl. Unit.: 8,99\nVl. Total\n6,74','a');
 assert.equal(r.items[0].total,'6,74');assert.equal(r.items[0].description,'BANANA');
});
test('sem total observado não inventa preço x quantidade',()=>{
 const r=parse('ARROZ (Código: 7) Vl. Total\nQtde.: 2 UN: UN Vl. Unit.: 7,50','a');
 assert.equal(r.items.length,1);assert.equal(r.items[0].total,'');assert.equal(r.warnings.length,1);
});
test('quantidade não vira preço e número na descrição não vira total',()=>{
 const r=parse('PRODUTO 2,50 (Código: 7)\nQtde.: 0,750 UN: KG Vl. Unit.: 8,99','a');
 assert.equal(r.items[0].total,'');assert.equal(r.items[0].quantity,'0,750');
});
test('contagem divergente é avisada; pagamento não vira item',()=>{
 const r=parse(layout.replace('total de itens: 10','total de itens: 11'),'a');
 assert.equal(r.items.length,10);assert.match(r.warnings.join(' '),/11 itens/);
});
test('itens iguais não são apagados como sobreposição',()=>{
 const r=parse('ARROZ 2 UN x 7,50 15,00\nARROZ 2 UN x 7,50 15,00','a');assert.equal(r.items.length,2);
});
test('texto ilegível produz orientação em vez de falso sucesso',()=>{
 const r=parse('Texto ilegível sem itens','a');assert.equal(r.items.length,0);assert.match(r.warnings.join(' '),/Reconstruir/);
});
module.exports={products,layout};
