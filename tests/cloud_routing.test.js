// Optional production-router regression test, without Vercel login/deployment.
// npm install --prefix .data/vercel-routing --no-audit --no-fund @vercel/routing-utils
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {getTransformedRoutes}=require('../.data/vercel-routing/node_modules/@vercel/routing-utils');
const handler=require('../api/index.js');
const config=require('../vercel.json');
test('roteador oficial da Vercel encaminha API estática para função existente',async()=>{
 const transformed=getTransformedRoutes(config);assert.equal(transformed.error,null);
 const rule=transformed.routes.find(r=>r.dest?.includes('rip_route='));assert(rule);
 for(const path of ['auth/signup','auth/status','purchases','purchases/delete','stats']){
  const match=new RegExp(rule.src).exec('/api/'+path);assert(match);
  const destination=rule.dest.replace(/\$(\d+)/g,(_,n)=>match[Number(n)]||'');
  const url=new URL(destination,'https://rip.invalid');
  assert.equal(url.pathname,'/api/index');assert.equal(url.searchParams.get('rip_route'),path);
 }
 const previous={...process.env},originalFetch=global.fetch;
 try{
  process.env.SUPABASE_URL='https://test.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';process.env.RIP_APP_ORIGIN='https://ripb.vercel.app';
  let upstream;
  global.fetch=async url=>{upstream=url;return {ok:true,json:async()=>({id:'synthetic-user'})}};
  const match=new RegExp(rule.src).exec('/api/auth/signup');
  const url=rule.dest.replace(/\$(\d+)/g,(_,n)=>match[Number(n)]||'');
  const req={url,method:'POST',headers:{origin:'https://ripb.vercel.app','content-type':'application/json'},body:{email:'test@example.com',password:'synthetic-password'}};
  const res={setHeader(){},status(code){this.code=code;return this},json(value){this.value=value}};
  await handler(req,res);assert.equal(res.code,200);assert.match(upstream,/\/auth\/v1\/signup\?/);assert.match(res.value.message,/Confira seu e-mail/);
 }finally{
  global.fetch=originalFetch;
  for(const k of ['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','RIP_APP_ORIGIN'])if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];
 }
});
