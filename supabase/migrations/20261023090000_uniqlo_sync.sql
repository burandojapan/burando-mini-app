-- Additive TEST-first integration. Private source/cost records; sanitized variants in catalog.
begin;
alter table public.products add column if not exists external_source text;
alter table public.products add column if not exists external_id text;
alter table public.products add column if not exists name_ru text;
alter table public.products add column if not exists variants jsonb;
alter table public.products add column if not exists last_synced_at timestamptz;
create unique index if not exists products_external_identity on public.products(external_source,external_id) where external_source is not null;
create table if not exists public.uniqlo_settings (
 id int primary key check(id=1), paused boolean not null default true, approved boolean not null default false,
 permission_reference text not null default '', markup_percent numeric not null default 50 check(markup_percent between 0 and 500),
 price_policy text not null default 'review' check(price_policy in ('review','automatic')),
 usdjpy_rate numeric not null default 150 check(usdjpy_rate between 1 and 1000),
 rate_mode text not null default 'manual' check(rate_mode in ('manual','feed')),
 rate_source text not null default '', rate_observed_at timestamptz, rate_approved boolean not null default false,
 version bigint not null default 0,
 check(not approved or (permission_reference<>'' and rate_source<>'' and rate_observed_at is not null and rate_approved))
);
insert into public.uniqlo_settings(id) values(1) on conflict do nothing;
create table if not exists public.uniqlo_category_mappings (
 source_category_id text primary key, audience text not null, category text not null, verified boolean not null default false
);
create table if not exists public.uniqlo_sync_runs (
 id uuid primary key default gen_random_uuid(), status text not null default 'running' check(status in ('running','success','partial','failed','expired')),
 started_at timestamptz not null default now(), finished_at timestamptz, lease_until timestamptz not null default now()+interval '5 minutes',
 imported integer not null default 0, errors integer not null default 0, config_version bigint not null
);
create table if not exists public.uniqlo_reviews (
 external_id text primary key, run_id uuid references public.uniqlo_sync_runs(id), reason text not null, proposed_price jsonb, updated_at timestamptz not null default now()
);
create table if not exists public.uniqlo_source_products (
 external_id text primary key, product_code text unique not null references public.products(code),
 source_url text not null, category_id text not null, regular_jpy numeric not null, discounted_jpy numeric,
 usdjpy_rate numeric not null, markup_percent numeric not null, rate_source text not null,
 rate_observed_at timestamptz not null, observed_at timestamptz not null, price_updated_at timestamptz not null default now(),
 last_synced_at timestamptz not null default now(), price_review boolean not null default false
);
create table if not exists public.uniqlo_variants (
 external_id text not null references public.uniqlo_source_products(external_id), color_id text not null, size_id text not null,
 data jsonb not null, observed_at timestamptz not null, primary key(external_id,color_id,size_id)
);
create index if not exists uniqlo_runs_started on public.uniqlo_sync_runs(started_at desc);
alter table public.uniqlo_settings enable row level security;
alter table public.uniqlo_category_mappings enable row level security;
alter table public.uniqlo_sync_runs enable row level security;
alter table public.uniqlo_reviews enable row level security;
alter table public.uniqlo_source_products enable row level security;
alter table public.uniqlo_variants enable row level security;
revoke all on public.uniqlo_settings,public.uniqlo_category_mappings,public.uniqlo_sync_runs,public.uniqlo_reviews,public.uniqlo_source_products,public.uniqlo_variants from public,anon,authenticated;
grant all on public.uniqlo_settings,public.uniqlo_category_mappings,public.uniqlo_sync_runs,public.uniqlo_reviews,public.uniqlo_source_products,public.uniqlo_variants to service_role;

create or replace function public.burando_uniqlo_start(p_version bigint) returns uuid
language plpgsql security invoker set search_path=public as $$
declare result uuid;
begin
 perform 1 from public.uniqlo_settings where id=1 and approved and version=p_version for update;
 if not found then raise exception 'Configuration changed or not approved'; end if;
 update public.uniqlo_sync_runs set status='expired',finished_at=now() where status='running' and lease_until<now();
 if exists(select 1 from public.uniqlo_sync_runs where status='running') then raise exception 'Sync already running'; end if;
 insert into public.uniqlo_sync_runs(config_version) values(p_version) returning id into result;
 return result;
end $$;

create or replace function public.burando_uniqlo_settings(p_data jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
begin
 update public.uniqlo_settings set paused=(p_data->>'paused')::boolean, approved=(p_data->>'approved')::boolean,
 permission_reference=p_data->>'permission_reference',markup_percent=(p_data->>'markup_percent')::numeric,
 price_policy=p_data->>'price_policy',usdjpy_rate=(p_data->>'usdjpy_rate')::numeric,rate_source=p_data->>'rate_source',rate_mode=coalesce(p_data->>'rate_mode','manual'),
 rate_observed_at=(p_data->>'rate_observed_at')::timestamptz,rate_approved=(p_data->>'rate_approved')::boolean,version=version+1 where id=1;
 return jsonb_build_object('ok',true);
end $$;
-- In feed mode the admin approves the FX source; each fresh rate is recorded automatically.
create or replace function public.burando_uniqlo_rate(p_run uuid,p_version bigint,p_rate numeric,p_source text,p_observed timestamptz) returns void
language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from public.uniqlo_settings where id=1 and version=p_version and approved and rate_approved and rate_mode='feed' and rate_source=p_source for update;
 if not found or p_rate not between 1 and 1000 or p_observed<now()-interval '26 hours' or p_observed>now()+interval '5 minutes' then raise exception 'Unapproved rate'; end if;
 if not exists(select 1 from public.uniqlo_sync_runs where id=p_run and status='running' and lease_until>=now() and config_version=p_version) then raise exception 'Lease expired'; end if;
 update public.uniqlo_settings set usdjpy_rate=p_rate,rate_observed_at=p_observed where id=1;
end $$;

create or replace function public.burando_uniqlo_mapping(p_data jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
begin
 -- Serializes mapping changes against ingestion and fences already-started runs.
 update public.uniqlo_settings set version=version+1 where id=1;
 insert into public.uniqlo_category_mappings values(p_data->>'source_category_id',p_data->>'audience',p_data->>'category',(p_data->>'verified')::boolean)
 on conflict(source_category_id) do update set audience=excluded.audience,category=excluded.category,verified=excluded.verified;
 return jsonb_build_object('ok',true);
end $$;
create or replace function public.burando_uniqlo_review(p_run uuid,p_external_id text,p_reason text) returns void
language plpgsql security invoker set search_path=public as $$
begin
 update public.uniqlo_sync_runs set lease_until=now()+interval '5 minutes' where id=p_run and status='running' and lease_until>=now();
 if not found then raise exception 'Lease expired'; end if;
 insert into public.uniqlo_reviews(external_id,run_id,reason) values(p_external_id,p_run,p_reason)
 on conflict(external_id) do update set run_id=excluded.run_id,reason=excluded.reason,updated_at=now();
end $$;

create or replace function public.burando_uniqlo_apply(p_run uuid,p_version bigint,p_item jsonb) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare cfg public.uniqlo_settings; old public.products; src public.uniqlo_source_products; v jsonb; vv jsonb;
 eid text:=p_item->>'product_id'; pcode text; is_review boolean:=false; changed boolean;
begin
 select * into cfg from public.uniqlo_settings where id=1 for update;
 if cfg.version<>p_version or not cfg.approved then raise exception 'Configuration changed'; end if;
 update public.uniqlo_sync_runs set lease_until=now()+interval '5 minutes' where id=p_run and status='running' and lease_until>=now() and config_version=p_version;
 if not found then raise exception 'Lease expired'; end if;
 if eid !~ '^[A-Za-z0-9_-]{1,80}$' or not (p_item->>'inventory_verified')::boolean or not (p_item->>'category_verified')::boolean or not (p_item->>'content_usage_verified')::boolean
 or (p_item->>'observed_at')::timestamptz < now()-interval '26 hours'
 or (p_item->>'observed_at')::timestamptz > now()+interval '5 minutes'
 or cfg.rate_observed_at<now()-interval '26 hours' or not cfg.rate_approved
 then raise exception 'Unverified or stale product/rate'; end if;
 if not exists(select 1 from public.uniqlo_category_mappings m where m.source_category_id=p_item->>'category_id' and m.verified and p_item->>'category'='uniqlo/'||m.audience||'/'||m.category) then raise exception 'Unclassified product'; end if;
 if (p_item->>'price')::numeric is distinct from round((p_item->>'regular_jpy')::numeric/cfg.usdjpy_rate*(1+cfg.markup_percent/100),2)
 or (p_item->>'sale_price')::numeric is distinct from round((p_item->>'discounted_jpy')::numeric/cfg.usdjpy_rate*(1+cfg.markup_percent/100),2)
 then raise exception 'Pricing mismatch'; end if;
 select * into old from public.products where external_source='uniqlo_jp' and external_id=eid for update;
 select * into src from public.uniqlo_source_products where external_id=eid;
 if src.observed_at is not null and (p_item->>'observed_at')::timestamptz<src.observed_at then
  perform public.burando_uniqlo_review(p_run,eid,'Out-of-order source observation'); return jsonb_build_object('review',true);
 end if;
 pcode:=coalesce(old.code,'UQ-JP-'||eid);
 changed:=old.id is not null and (old.price is distinct from (p_item->>'price')::numeric or old.sale_price is distinct from (p_item->>'sale_price')::numeric);
 is_review:=(changed or coalesce(src.price_review,false)) and cfg.price_policy='review';
 -- Availability is refreshed even when price changes require review. Never infer absence.
 if old.id is null then
  insert into public.products(code,name,name_ru,brand,price,sale_price,category,description,description_uz,description_ru,images,sizes,colors,active,external_source,external_id,variants)
  values(pcode,p_item->>'name_uz',p_item->>'name_ru','UNIQLO',(p_item->>'price')::numeric,(p_item->>'sale_price')::numeric,p_item->>'category',p_item->>'description_uz',p_item->>'description_uz',p_item->>'description_ru','[]','[]','[]',false,'uniqlo_jp',eid,'[]');
 end if;
 insert into public.uniqlo_source_products(external_id,product_code,source_url,category_id,regular_jpy,discounted_jpy,usdjpy_rate,markup_percent,rate_source,rate_observed_at,observed_at)
 values(eid,pcode,p_item->>'url',p_item->>'category_id',(p_item->>'regular_jpy')::numeric,(p_item->>'discounted_jpy')::numeric,cfg.usdjpy_rate,cfg.markup_percent,cfg.rate_source,cfg.rate_observed_at,(p_item->>'observed_at')::timestamptz)
 on conflict(external_id) do update set source_url=excluded.source_url,category_id=excluded.category_id,observed_at=excluded.observed_at,last_synced_at=now();
 for v in select value from jsonb_array_elements(p_item->'variants') loop
  insert into public.uniqlo_variants values(eid,v->>'color_id',v->>'size_id',v,(p_item->>'observed_at')::timestamptz)
  on conflict(external_id,color_id,size_id) do update set data=excluded.data,observed_at=excluded.observed_at;
 end loop;
 select jsonb_agg(data order by color_id,size_id) into vv from public.uniqlo_variants where external_id=eid;
 update public.products set name=p_item->>'name_uz',name_ru=p_item->>'name_ru',category=p_item->>'category',
 description=p_item->>'description_uz',description_uz=p_item->>'description_uz',description_ru=p_item->>'description_ru',
 images=(select jsonb_agg(distinct im) from jsonb_array_elements(vv) a cross join lateral jsonb_array_elements(a.value->'images') im),
 sizes=(select jsonb_agg(distinct a.value->>'size_id') from jsonb_array_elements(vv) a),
 colors=(select jsonb_agg(distinct a.value->>'color_id') from jsonb_array_elements(vv) a),
 variants=vv,last_synced_at=now(),
 active=case when is_review then false else exists(select 1 from jsonb_array_elements(vv) a where (a.value->>'available')::boolean) end,
 price=case when is_review then price else (p_item->>'price')::numeric end,
 sale_price=case when is_review then null else (p_item->>'sale_price')::numeric end,
 sale_start=null,sale_end=null,price_uzs=null,sale_price_uzs=null where products.code=pcode;
 update public.uniqlo_source_products set price_review=is_review where external_id=eid;
 if is_review then
  perform public.burando_uniqlo_review(p_run,eid,'Price change requires admin review. Reimport with automatic policy after approval.');
  update public.uniqlo_reviews set proposed_price=jsonb_build_object('regular_jpy',p_item->'regular_jpy','discounted_jpy',p_item->'discounted_jpy','price',p_item->'price','sale_price',p_item->'sale_price','usdjpy_rate',cfg.usdjpy_rate,'markup_percent',cfg.markup_percent) where external_id=eid;
 else
  update public.uniqlo_source_products set regular_jpy=(p_item->>'regular_jpy')::numeric,discounted_jpy=(p_item->>'discounted_jpy')::numeric,
  usdjpy_rate=cfg.usdjpy_rate,markup_percent=cfg.markup_percent,rate_source=cfg.rate_source,rate_observed_at=cfg.rate_observed_at,
  price_updated_at=case when changed or old.id is null then now() else price_updated_at end where external_id=eid;
  delete from public.uniqlo_reviews where external_id=eid;
 end if;
 return jsonb_build_object('review',is_review,'code',pcode);
end $$;

create or replace function public.burando_uniqlo_finish(p_run uuid,p_status text,p_imported int,p_errors int) returns void
language plpgsql security invoker set search_path=public as $$
begin
 update public.uniqlo_sync_runs set status=p_status,finished_at=now(),imported=p_imported,errors=p_errors where id=p_run and status='running';
end $$;
create or replace function public.burando_uniqlo_status() returns jsonb
language sql security invoker set search_path=public as $$
 select jsonb_build_object('settings',(select to_jsonb(s) from public.uniqlo_settings s where id=1),
 'total',(select count(*) from public.products where external_source='uniqlo_jp'),
 'active',(select count(*) from public.products where external_source='uniqlo_jp' and active),
 'sale',(select count(*) from public.products where external_source='uniqlo_jp' and active and sale_price is not null),
 'available_variants',(select count(*) from public.uniqlo_variants where (data->>'available')::boolean),
 'last_success',(select max(finished_at) from public.uniqlo_sync_runs where status='success'),
 'history',coalesce((select jsonb_agg(r) from (select * from public.uniqlo_sync_runs order by started_at desc limit 50) r),'[]'),
 'reviews',coalesce((select jsonb_agg(r) from (select * from public.uniqlo_reviews order by updated_at desc limit 200) r),'[]'),
 'mappings',coalesce((select jsonb_agg(m) from public.uniqlo_category_mappings m),'[]'))
$$;

-- Atomic ordering check closes the race between the HTTP cart snapshot and order insert.
create or replace function public.burando_check_external_variant() returns trigger
language plpgsql security invoker set search_path=public as $$
declare p public.products; v jsonb;
begin
 select * into p from public.products where code=new.product_code for share;
 if p.external_source='uniqlo_jp' then
  if not p.active or not exists(select 1 from jsonb_array_elements(p.variants) a where a.value->>'color_id'=new.color and a.value->>'size_id'=new.size and (a.value->>'available')::boolean)
  then raise exception 'UNIQLO variant unavailable'; end if;
  if new.unit_price is distinct from coalesce(p.sale_price,p.price) then raise exception 'UNIQLO price changed'; end if;
 end if;
 return new;
end $$;
drop trigger if exists burando_check_external_variant on public.order_items;
create trigger burando_check_external_variant before insert on public.order_items for each row execute function public.burando_check_external_variant();
revoke all on function public.burando_uniqlo_rate(uuid,bigint,numeric,text,timestamptz),public.burando_uniqlo_start(bigint),public.burando_uniqlo_settings(jsonb),public.burando_uniqlo_mapping(jsonb),public.burando_uniqlo_review(uuid,text,text),public.burando_uniqlo_apply(uuid,bigint,jsonb),public.burando_uniqlo_finish(uuid,text,int,int),public.burando_uniqlo_status(),public.burando_check_external_variant() from public,anon,authenticated;
grant execute on function public.burando_uniqlo_rate(uuid,bigint,numeric,text,timestamptz),public.burando_uniqlo_start(bigint),public.burando_uniqlo_settings(jsonb),public.burando_uniqlo_mapping(jsonb),public.burando_uniqlo_review(uuid,text,text),public.burando_uniqlo_apply(uuid,bigint,jsonb),public.burando_uniqlo_finish(uuid,text,int,int),public.burando_uniqlo_status(),public.burando_check_external_variant() to service_role;
commit;
