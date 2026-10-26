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

test('nome e CNPJ do cabeçalho, inclusive marcador CNP) do OCR',()=>{
 const r=parse('DANFE NFC-e\nMERCADO DE TESTE LTDA\nCNP): 11.222.333/0001-81\n'+layout,'a');
 assert.equal(r.store,'MERCADO DE TESTE LTDA');assert.equal(r.cnpj,'11.222.333/0001-81');assert.equal(r.items.length,10);
});
test('CNPJ sem pontuação e nome na mesma linha',()=>{
 const r=parse('MERCADO TESTE CNPJ: 11222333000181\n'+layout,'a');
 assert.equal(r.store,'MERCADO TESTE');assert.equal(r.cnpj,'11.222.333/0001-81');
});
test('CNPJ ilegível ou inválido não é adivinhado',()=>{
 for(const value of ['11.222.333/0001-82','00.000.000/0000-00','11.222.33O/0001-81']){
  const r=parse('MERCADO TESTE\nCNPJ: '+value+'\n'+layout,'a');
  assert.equal(r.cnpj,'');assert.equal(r.store,'MERCADO TESTE');assert.match(r.warnings.join(' '),/CNPJ/);
 }
});
test('captura sem cabeçalho não inventa estabelecimento',()=>{
 const r=parse(layout,'a');assert.equal(r.store,'');assert.equal(r.cnpj,'');
 const footerOnly=parse('ARROZ 2 UN x 7,50 15,00\nValor a pagar R$: 15,00\nCONSUMIDOR\nCNPJ: 11.222.333/0001-81','a');
 assert.equal(footerOnly.store,'');assert.equal(footerOnly.cnpj,'');
});

test('unidades comerciais não ficam restritas a UN e KG',()=>{
 for(const u of ['PCT','PCT9','UND9','CX','FD','PAR','DZ','M2','SC25']){
  const r=parse(`PRODUTO TESTE (Código: 1) Vl. Total\nQtde.: 1 UN: ${u} Vl. Unit.: 8,49 8,49`,'a');
  assert.equal(r.items[0].unit,u);assert.equal(r.items[0].unitPrice,'8,49');assert.equal(r.items[0].total,'8,49');
 }
});
test('rótulo de preço colado à unidade não elimina os valores',()=>{
 const r=parse('PRODUTO TESTE (Código: 1) VI.\nTotal\nQtde.: 1 UN: UND9VI. Unit.: 8,49 8,49','a');
 assert.deepEqual([r.items[0].description,r.items[0].unit,r.items[0].unitPrice,r.items[0].total],['PRODUTO TESTE','UND9','8,49','8,49']);
 assert.equal(r.warnings.length,0);
});
test('uma casa decimal é preservada e completada com zero',()=>{
 const r=parse('PRODUTO TESTE (Código: 1) VI.\nTotal\nQtde.: 1 UN: UND9VI. Unit.: 15,9 15,90','a');
 assert.equal(r.items[0].unitPrice,'15,90');assert.equal(r.items[0].total,'15,90');
 const s=parse('PRODUTO TESTE (Código: 1)\nQtde.: 1 UN: PCT Vl. Unit.: 3,9 3,9','a');
 assert.equal(s.items[0].total,'3,90');
});
test('vírgulas ausentes ou trocadas por barra não são adivinhadas',()=>{
 const r=parse('PRODUTO TESTE (Código: 1)\nQtde.: 5 UN: PCT9VI. Unit.: 759 5/95','a');
 assert.equal(r.items[0].quantity,'5');assert.equal(r.items[0].unit,'PCT9');
 assert.equal(r.items[0].unitPrice,'');assert.equal(r.items[0].total,'');
 assert.match(r.warnings.join(' '),/não adivinha/);
});
test('valores colados e ambíguos não viram um preço aparentemente válido',()=>{
 const r=parse('PRODUTO TESTE (Código: 1)\nQtde.: 1 UN: UND9VI. Unit.: 8,498,49','a');
 assert.equal(r.items[0].unitPrice,'');assert.equal(r.items[0].total,'');
});
test('preço com milhar e casas adicionais permanece íntegro',()=>{
 const r=parse('PRODUTO TESTE (Código: 1)\nQtde.: 1 UN: CX Vl. Unit.: 1.234,56 1.234,56','a');
 assert.equal(r.items[0].unitPrice,'1.234,56');assert.equal(r.items[0].total,'1.234,56');
 const s=parse('PRODUTO TESTE (Código: 1)\nQtde.: 1 UN: KG Vl. Unit.: 8,4999 8,50','a');
 assert.equal(s.items[0].unitPrice,'8,4999');assert.equal(s.items[0].total,'8,50');
});

test('barra no lugar de 7 gera sugestão sem preencher campos',()=>{
 const r=parse('PRODUTO TESTE (Código: 1)\nQtde.: 1 UN: PCT Vl. Unit.: /,59 /,59','a');
 const i=r.items[0];assert.equal(i.unitPrice,'');assert.equal(i.total,'');
 assert.deepEqual(i.ocrSuggestions.map(s=>[s.field,s.original,s.value]),[['unitPrice','/,59','7,59'],['total','/,59','7,59']]);
 assert.ok(i.rawText.includes('/,59'));assert.match(r.warnings.join(' '),/confusão/);
});
test('barra em qualquer posição decimal pode sugerir 7',()=>{
 const r=parse('PRODUTO TESTE (Código: 1)\nQtde.: 1 UN: PCT Vl. Unit.: 3/,9/ 3/,9/','a');
 assert.deepEqual(r.items[0].ocrSuggestions.map(s=>s.value),['37,97','37,97']);
});
test('não inventa uma vírgula junto com a troca de barra por 7',()=>{
 const r=parse('PRODUTO TESTE (Código: 1)\nQtde.: 5 UN: PCT9Vl. Unit.: 759 5/95','a');
 assert.deepEqual(r.items[0].ocrSuggestions,[]);assert.equal(r.items[0].unitPrice,'');assert.equal(r.items[0].total,'');
});
test('barras de descrição, unidade ou código não são corrigidas',()=>{
 const r=parse('PRODUTO 1/2 (Código: 12/34)\nQtde.: 1 UN: KG/L Vl. Unit.: 8,49 8,49','a');
 const i=r.items[0];assert.deepEqual(i.ocrSuggestions,[]);assert.equal(i.unit,'KG/L');assert.equal(i.productCode,'12/34');assert.equal(i.description,'PRODUTO 1/2');
});
