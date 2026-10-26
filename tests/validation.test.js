const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../web/receipt.js');
require('../web/fiscal.js');
const {validate}=require('../web/validation.js');
const base=()=>({key:'26261011222333000181650010000000011123456784',store:'MERCADO TESTE',cnpj:'11.222.333/0001-81',date:'2026-10-26',discount:'0,00',extra:'0,00',receiptTotal:'20,00',receiptText:'original',parsedText:'original',analysis:{expectedCount:2},items:[{description:'LEITE',quantity:'1',unit:'UN',unitPrice:'10,00',discount:'0,00',total:'10,00'},{description:'LEITE',quantity:'1',unit:'UN',unitPrice:'10,00',discount:'0,00',total:'10,00'}]});
test('compra íntegra fica pronta sem declaração de revisão e sem rejeitar produtos iguais',()=>{const r=validate(base());assert.equal(r.ready,true);assert.equal(r.difference,0);assert.deepEqual(r.issues,[])});
test('data ausente é uma pendência específica',()=>{const p=base();p.date='';const r=validate(p);assert.equal(r.ready,false);assert.deepEqual(r.issues.map(x=>x.field),['date'])});
test('texto incompleto é bloqueado mesmo que o total coincida',()=>{const p=base();p.analysis.expectedCount=3;const r=validate(p);assert.equal(r.difference,0);assert.equal(r.ready,false);assert.equal(r.issues[0].field,'count')});
test('unidade ausente aponta apenas o item correspondente',()=>{const p=base();p.items[1].unit='';const r=validate(p);assert.equal(r.ready,false);assert.equal(r.issues[0].index,1);assert.equal(r.issues[0].field,'unit')});
test('desconto de item e ajustes gerais entram uma única vez',()=>{const p=base();p.items[0].discount='0,50';p.items[0].total='9,50';p.discount='2,00';p.extra='1,00';p.receiptTotal='18,50';const r=validate(p);assert.equal(r.ready,true);assert.equal(r.subtotal,1950);assert.equal(r.total,1850)});
test('datas impossíveis e CNPJ inválido são pendências',()=>{const p=base();p.date='2026-02-31';p.cnpj='00.000.000/0000-00';assert.deepEqual(validate(p).issues.map(x=>x.field),['date','cnpj'])});
test('texto alterado precisa ser reinterpretado',()=>{const p=base();p.receiptText='outro texto';assert.equal(validate(p).issues[0].field,'receiptText')});
test('valores inválidos não viram total conciliado',()=>{const p=base();p.items[0].total='NaN';const r=validate(p);assert.equal(r.ready,false);assert.equal(r.total,null);assert.equal(r.difference,null)});

test('chave é obrigatória para registrar, sem validar autenticidade',()=>{const p=base();p.key='';const r=validate(p);assert.equal(r.ready,false);assert.equal(r.issues[0].field,'key')});
test('chave e CNPJ do estabelecimento devem corresponder',()=>{const p=base();p.cnpj='12.345.678/0001-95';assert.match(validate(p).issues.map(x=>x.message).join(' '),/outro CNPJ/)});
test('mês e ano da chave devem corresponder à data',()=>{const p=base();p.date='2026-09-26';assert.match(validate(p).issues.map(x=>x.message).join(' '),/mês\/ano/)});
