// Optional isolated PostgreSQL test, never connects to the production project.
// npm install --prefix .data/pg-test --no-audit --no-fund @electric-sql/pglite
import {PGlite} from '../.data/pg-test/node_modules/@electric-sql/pglite/dist/index.js';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const idA='a'.repeat(32),idB='b'.repeat(32);
const key='26261011222333000181650010000000011123456784';
function note(id=idA){return {id,status:'confirmed',store:'Mercado sintético',cnpj:'11.222.333/0001-81',date:'2026-10-26',key,receiptTotal:'9,90',discount:'0',extra:'0',items:[{description:'Produto sintético',quantity:'1',unit:'UN',unitPrice:'9,90',total:'9,90'}],fiscalValidation:{authenticity:'verified'},images:[]}}
test('PostgreSQL: isolamento, validação direta, atomicidade e concorrência',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; insert into auth.users values('${A}'),('${B}');`);
  await db.exec(readFileSync(new URL('../supabase/migrations/001_accounts.sql',import.meta.url),'utf8'));
  const as=async user=>{await db.exec('reset role;set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user])};
  const save=(p,rev=null)=>db.query('select public.rip_save_purchase($1::jsonb,$2::integer) as result',[JSON.stringify(p),rev]);
  await t.test('anônimo não consulta nem grava',async()=>{await db.exec('set role anon');await assert.rejects(db.query('select * from public.purchases'),/permission denied/);await assert.rejects(save(note()),/permission denied/)});
  await as(A);
  await t.test('gravação vincula ao usuário e ignora suposta autenticação fiscal',async()=>{const p=note();p.owner_id=B;const r=await save(p);assert.equal(r.rows[0].result._revision,1);assert.equal(r.rows[0].result.fiscalValidation.authenticity,'not_checked');const rows=await db.query('select owner_id from public.purchases');assert.equal(rows.rows[0].owner_id,A)});
  await t.test('API direta não permite inserir/alterar tabelas sem validação',async()=>{await assert.rejects(db.query("update public.purchases set store='x'"),/permission denied/);await assert.rejects(db.query('delete from public.purchase_items'),/permission denied/)});
  await t.test('mesma chave na mesma conta não se duplica',async()=>{await assert.rejects(save(note(idB)),/duplicate key/)});
  await t.test('total errado e chave inválida são recusados pela função SQL',async()=>{const p=note();p.receiptTotal='1,00';await assert.rejects(save(p,1),/soma/);p.receiptTotal='9,90';p.key=key.slice(0,-1)+'5';await assert.rejects(save(p,1),/chave/);const r=await db.query('select revision from public.purchases');assert.equal(r.rows[0].revision,1)});
  await t.test('duas edições não se sobrescrevem e versão anterior é preservada',async()=>{const result=await save(note(),1);assert.equal(result.rows[0].result.history.length,1);assert.equal(result.rows[0].result.history[0].items[0].description,'Produto sintético');await assert.rejects(save(note(),1),/outro dispositivo/)});
  await as(B);
  await t.test('outra conta não lê nem exclui os dados',async()=>{assert.equal((await db.query('select * from public.purchases')).rows.length,0);assert.equal((await db.query('select * from public.purchase_items')).rows.length,0);await assert.rejects(db.query('select public.rip_delete_purchase($1,$2)',[idA,2]),/não encontrada/)});
  await t.test('a mesma nota pode pertencer a contas diferentes sem revelar existência',async()=>{await save(note(idB));const stats=await db.query('select public.rip_stats() as value');assert.deepEqual(stats.rows[0].value,{count:1,pending:0,totalCents:990})});
  await as(A);
  await t.test('rascunho incompleto pode persistir',async()=>{const p={id:'c'.repeat(32),status:'draft',items:[]};await save(p);assert.equal((await db.query('select public.rip_stats() as value')).rows[0].value.pending,1)});
  await t.test('erro ao inserir um item reverte também a nota inteira',async()=>{const p={id:'d'.repeat(32),status:'draft',items:[{description:'Valor fora do limite',total:'9999999999999999999999'}]};await assert.rejects(save(p),/out of range/);assert.equal((await db.query("select * from public.purchases where id=$1",[p.id])).rows.length,0)});
  await t.test('exclusão usa revisão e remove apenas itens da própria nota',async()=>{await assert.rejects(db.query('select public.rip_delete_purchase($1,$2)',[idA,1]),/mudou/);await db.query('select public.rip_delete_purchase($1,$2)',[idA,2]);assert.equal((await db.query('select * from public.purchase_items')).rows.length,0);await as(B);assert.equal((await db.query('select * from public.purchase_items')).rows.length,1)});
 }finally{await db.close()}
});
