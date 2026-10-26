const {test}=require('node:test');
const assert=require('node:assert/strict');
require('../web/receipt.js');
const {inspect,normalize,digit}=require('../web/fiscal.js');
// Chave sintética: não corresponde a uma nota autenticada nem é consultada na SEFAZ.
const key='26261011222333000181650010000000011123456784';
test('vetor com DV conhecido: chave estruturada não significa autenticada',()=>{assert.equal(digit(key.slice(0,43)),'4');const r=inspect(key);assert.equal(r.valid,true);assert.equal(r.cnpj,'11222333000181');assert.equal(r.yearMonth,'2610');assert.equal(r.authenticity,'not_checked')});
test('espaços de cópia são removidos sem alterar dígitos',()=>{const formatted=key.match(/.{1,4}/g).join(' ');assert.equal(normalize(formatted),key);assert.equal(inspect(formatted).valid,true)});
test('ausência, tamanho errado e letras não são aceitos',()=>{for(const value of ['',key.slice(0,43),'A'+key])assert.equal(inspect(value).valid,false)});
test('dígito verificador errado é rejeitado',()=>{const r=inspect(key.slice(0,43)+'5');assert.equal(r.valid,false);assert.match(r.message,/verificador/)});
test('UF, mês, modelo e CNPJ precisam ser consistentes',()=>{for(const value of ['99'+key.slice(2),key.slice(0,4)+'00'+key.slice(6),key.slice(0,20)+'55'+key.slice(22),key.slice(0,6)+'00000000000000'+key.slice(20)])assert.equal(inspect(value).valid,false)});
