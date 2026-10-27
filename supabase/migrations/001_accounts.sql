-- Execute no SQL Editor do seu projeto Supabase. Não contém cupons nem senhas.
-- Instalação inicial: revisável, transacional e sem remover dados existentes.
begin;

create table public.purchases (
 owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 id text not null check (id ~ '^[a-f0-9]{32}$'),
 status text not null check (status in ('draft','confirmed')),
 store text not null default '', purchase_date date, merchant_cnpj text,
 fiscal_key text, receipt_total_cents bigint,
 item_count integer not null check (item_count between 0 and 2000),
 data jsonb not null check (jsonb_typeof(data) = 'object'),
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 primary key (owner_id,id)
);
create unique index purchases_owner_key on public.purchases(owner_id,fiscal_key) where fiscal_key ~ '^[0-9]{44}$';
create index purchases_owner_updated on public.purchases(owner_id,updated_at desc,id);

create table public.purchase_items (
 owner_id uuid not null default auth.uid(), purchase_id text not null,
 position integer not null check(position between 0 and 1999),
 description text not null, unit text not null,
 quantity numeric, unit_price numeric, total_cents bigint,
 data jsonb not null,
 primary key(owner_id,purchase_id,position),
 foreign key(owner_id,purchase_id) references public.purchases(owner_id,id) on delete cascade
);

alter table public.purchases enable row level security;
alter table public.purchase_items enable row level security;
create policy own_purchases on public.purchases for select to authenticated using ((select auth.uid())=owner_id);
create policy own_items on public.purchase_items for select to authenticated using ((select auth.uid())=owner_id);
-- Sem acesso anônimo nem escrita direta. Toda gravação passa pelas funções abaixo.
revoke all on public.purchases,public.purchase_items from public,anon,authenticated;
grant select on public.purchases,public.purchase_items to authenticated;

create function public.rip_number(value text) returns numeric
language plpgsql immutable set search_path='' as $$
declare cleaned text;
begin
 cleaned := regexp_replace(coalesce(value,''),'R\$|\s','','g');
 if position(',' in cleaned)>0 then cleaned:=replace(replace(cleaned,'.',''),',','.'); end if;
 if length(cleaned)>24 or cleaned !~ '^[0-9]+(\.[0-9]+)?$' then return null; end if;
 return cleaned::numeric;
end $$;

create function public.rip_date(value text) returns date
language plpgsql immutable set search_path='' as $$
begin
 if coalesce(value,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
 return value::date;
exception when datetime_field_overflow or invalid_datetime_format then return null;
end $$;

create function public.rip_cnpj_valid(value text) returns boolean
language plpgsql immutable set search_path='' as $$
declare n text:=regexp_replace(coalesce(value,''),'[^0-9]','','g'); sum integer; d integer; j integer; weights integer[];
begin
 if n !~ '^[0-9]{14}$' or n=repeat(substr(n,1,1),14) then return false; end if;
 for j in 1..2 loop
  weights:=case when j=1 then array[5,4,3,2,9,8,7,6,5,4,3,2] else array[6,5,4,3,2,9,8,7,6,5,4,3,2] end;
  sum:=0;
  for i in 1..array_length(weights,1) loop sum:=sum+substr(n,i,1)::integer*weights[i]; end loop;
  d:=sum%11; d:=case when d<2 then 0 else 11-d end;
  if d<>substr(n,12+j,1)::integer then return false; end if;
 end loop;
 return true;
end $$;

create function public.rip_key_valid(k text) returns boolean
language plpgsql immutable set search_path='' as $$
declare sum integer:=0; weight integer:=2; d integer;
begin
 if k is null or k !~ '^[0-9]{44}$' then return false; end if;
 if not (substr(k,1,2)=any(array['11','12','13','14','15','16','17','21','22','23','24','25','26','27','28','29','31','32','33','35','41','42','43','50','51','52','53']))
  or substr(k,5,2)::integer not between 1 and 12 or substr(k,21,2)<>'65' or not public.rip_cnpj_valid(substr(k,7,14)) then return false; end if;
 for i in reverse 43..1 loop
  sum:=sum+substr(k,i,1)::integer*weight; weight:=case when weight=9 then 2 else weight+1 end;
 end loop;
 d:=sum%11; d:=case when d<2 then 0 else 11-d end;
 return substr(k,44,1)::integer=d;
end $$;

create function public.rip_save_purchase(payload jsonb,expected_revision integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); pid text:=payload->>'id'; state text:=payload->>'status'; k text:=coalesce(payload->>'key','');
 old_revision integer; new_revision integer; stamp timestamptz:=clock_timestamp();
 n integer; p integer:=0; item jsonb; qty numeric; price numeric; discount numeric; total numeric;
 subtotal numeric:=0; general_discount numeric; extra numeric; receipt_total numeric; body jsonb; previous_data jsonb; previous_items jsonb;
begin
 if uid is null then raise exception 'Entre na sua conta.'; end if;
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>1500000 or pid is null or pid !~ '^[a-f0-9]{32}$' or state is null or state not in ('draft','confirmed') or jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'Compra inválida.'; end if;
 n:=jsonb_array_length(payload->'items');
 if n>2000 then raise exception 'Limite de 2000 itens por cupom.'; end if;
 -- Trava por conta/nota evita duas inserções simultâneas e protege versões concorrentes.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text||pid,0));
 select revision,data into old_revision,previous_data from public.purchases where owner_id=uid and id=pid for update;
 if old_revision is distinct from expected_revision then raise exception 'Esta compra mudou em outro dispositivo ou já foi importada. Atualize o histórico antes de salvar.'; end if;
 new_revision:=coalesce(old_revision,0)+1;
 receipt_total:=round(public.rip_number(payload->>'receiptTotal')*100);
 general_discount:=round(public.rip_number(coalesce(payload->>'discount','0'))*100);
 extra:=round(public.rip_number(coalesce(payload->>'extra','0'))*100);
 if state='confirmed' then
  if not public.rip_key_valid(k) then raise exception 'A chave da NFC-e está ausente ou é inválida.'; end if;
  if length(trim(coalesce(payload->>'store','')))=0 or n=0 then raise exception 'Informe estabelecimento e itens.'; end if;
  if coalesce(payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or to_char((payload->>'date')::date,'YYYY-MM-DD')<>payload->>'date' then raise exception 'Data inválida.'; end if;
  if to_char((payload->>'date')::date,'YYMM')<>substr(k,3,4) then raise exception 'Mês/ano da compra difere da chave.'; end if;
  if coalesce(payload->>'cnpj','')<>'' and (not public.rip_cnpj_valid(payload->>'cnpj') or regexp_replace(payload->>'cnpj','[^0-9]','','g')<>substr(k,7,14)) then raise exception 'CNPJ difere da chave ou é inválido.'; end if;
  if coalesce(payload->>'receiptText','')<>coalesce(payload->>'parsedText','') then raise exception 'Interprete o texto alterado antes de salvar.'; end if;
  if (payload#>>'{analysis,expectedCount}') ~ '^[0-9]+$' and (payload#>>'{analysis,expectedCount}')::numeric<>n then raise exception 'A contagem de itens difere do cupom.'; end if;
  if receipt_total is null or general_discount is null or extra is null then raise exception 'Totais inválidos.'; end if;
 end if;
 -- Valida o conteúdo mesmo quando a API é chamada diretamente, sem a interface RIP.
 for item in select value from jsonb_array_elements(payload->'items') loop
  if jsonb_typeof(item)<>'object' then raise exception 'Item inválido.'; end if;
  qty:=public.rip_number(item->>'quantity'); price:=public.rip_number(item->>'unitPrice');
  discount:=round(public.rip_number(coalesce(item->>'discount','0'))*100); total:=round(public.rip_number(item->>'total')*100);
  if state='confirmed' then
   if length(trim(coalesce(item->>'description','')))=0 or length(trim(coalesce(item->>'unit','')))=0 or qty is null or qty<=0 or price is null or total is null or discount is null or round(qty*price*100)-discount<0 or abs(round(qty*price*100)-discount-total)>1 then raise exception 'Item incompleto ou valores inconsistentes.'; end if;
   subtotal:=subtotal+total;
  end if;
 end loop;
 if state='confirmed' and (subtotal-general_discount+extra<>receipt_total or subtotal-general_discount+extra<0) then raise exception 'A soma dos itens e ajustes difere do total.'; end if;
 body:=(payload-'items'-'_revision'-'_summary'-'updated'-'images'-'fiscalValidation'-'owner_id'-'user_id')||jsonb_build_object(
  'images','[]'::jsonb,'itemCount',n,'fiscalValidation',jsonb_build_object('keyStatus',case when public.rip_key_valid(k) then 'valid_format' when k='' then 'missing' else 'invalid' end,'authenticity','not_checked'));
 if old_revision is not null then
  select coalesce(jsonb_agg(data order by position),'[]'::jsonb) into previous_items from public.purchase_items where owner_id=uid and purchase_id=pid;
  body:=jsonb_set(body,'{history}',case when jsonb_typeof(previous_data->'history')='array' then previous_data->'history' else '[]'::jsonb end||jsonb_build_array((previous_data-'history')||jsonb_build_object('items',previous_items)));
 end if;
 insert into public.purchases(owner_id,id,status,store,purchase_date,merchant_cnpj,fiscal_key,receipt_total_cents,item_count,data,revision,updated_at)
 values(uid,pid,state,coalesce(payload->>'store',''),public.rip_date(payload->>'date'),case when public.rip_cnpj_valid(payload->>'cnpj') then regexp_replace(payload->>'cnpj','[^0-9]','','g') else null end,nullif(k,''),receipt_total::bigint,n,body,new_revision,stamp)
 on conflict(owner_id,id) do update set status=excluded.status,store=excluded.store,purchase_date=excluded.purchase_date,merchant_cnpj=excluded.merchant_cnpj,fiscal_key=excluded.fiscal_key,receipt_total_cents=excluded.receipt_total_cents,item_count=excluded.item_count,data=excluded.data,revision=excluded.revision,updated_at=excluded.updated_at;
 delete from public.purchase_items where owner_id=uid and purchase_id=pid;
 for item in select value from jsonb_array_elements(payload->'items') loop
  insert into public.purchase_items(owner_id,purchase_id,position,description,unit,quantity,unit_price,total_cents,data)
   values(uid,pid,p,coalesce(item->>'description',''),coalesce(item->>'unit',''),public.rip_number(item->>'quantity'),public.rip_number(item->>'unitPrice'),round(public.rip_number(item->>'total')*100)::bigint,item);
  p:=p+1;
 end loop;
 return jsonb_build_object('id',pid,'_revision',new_revision,'updated',stamp,'fiscalValidation',body->'fiscalValidation','images','[]'::jsonb,'history',coalesce(body->'history','[]'::jsonb));
end $$;

create function public.rip_delete_purchase(purchase_id text,expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); found_revision integer;
begin
 if uid is null then raise exception 'Entre na sua conta.'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text||purchase_id,0));
 select revision into found_revision from public.purchases where owner_id=uid and id=purchase_id for update;
 if found_revision is null then raise exception 'Compra não encontrada.'; end if;
 if found_revision is distinct from expected_revision then raise exception 'Esta compra mudou. Atualize o histórico antes de excluir.'; end if;
 delete from public.purchases where owner_id=uid and id=purchase_id;
 return jsonb_build_object('deleted',purchase_id);
end $$;

create function public.rip_stats() returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('count',count(*),'pending',count(*) filter(where status='draft'),'totalCents',coalesce(sum(receipt_total_cents) filter(where status='confirmed'),0)) from public.purchases;
$$;

revoke all on function public.rip_number(text),public.rip_date(text),public.rip_cnpj_valid(text),public.rip_key_valid(text),public.rip_save_purchase(jsonb,integer),public.rip_delete_purchase(text,integer),public.rip_stats() from public,anon,authenticated;
grant execute on function public.rip_save_purchase(jsonb,integer),public.rip_delete_purchase(text,integer),public.rip_stats() to authenticated;
-- Nenhum consentimento coletivo ou acesso estatístico entre contas é habilitado aqui.
notify pgrst,'reload schema';
commit;
