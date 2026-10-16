-- Additive migration: independent admin prices; no exchange rates/backfill.
alter table public.products add column if not exists price_uzs numeric(18,2);
alter table public.products add column if not exists sale_price_uzs numeric(18,2);
alter table public.orders add column if not exists total_uzs numeric(18,2);
alter table public.order_items add column if not exists unit_price_uzs numeric(18,2);
alter table public.order_items add column if not exists line_total_uzs numeric(18,2);
alter table public.products add constraint manual_uzs_price_valid check(price_uzs is null or price_uzs between 0 and 999999999999.99);
alter table public.products add constraint manual_uzs_sale_valid check(
 (sale_price_uzs is null and (sale_price is null or price_uzs is null)) or
 (sale_price_uzs is not null and price_uzs is not null and sale_price is not null and sale_price_uzs>0 and sale_price_uzs<price_uzs));
alter table public.orders add constraint order_uzs_total_valid check(total_uzs is null or total_uzs between 0 and 9999999999999999.99);
alter table public.order_items add constraint item_uzs_snapshot_valid check(
 (unit_price_uzs is null and line_total_uzs is null) or
 (unit_price_uzs is not null and line_total_uzs is not null and unit_price_uzs>=0 and line_total_uzs=unit_price_uzs*qty));

create or replace function public.burando_create_order(p_order jsonb, p_items jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare saved public.orders; existing public.orders; item jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_order->>'idempotency_key',0));
 select * into existing from public.orders where idempotency_key=p_order->>'idempotency_key';
 if found then
   if existing.request_hash is distinct from p_order->>'request_hash' or existing.lookup_token_hash is distinct from p_order->>'lookup_token_hash' then
     raise exception 'Idempotency conflict';
   end if;
   return jsonb_build_object('order_code',existing.order_code,'total',existing.total,'total_uzs',existing.total_uzs,'payment_status',existing.payment_status,'order_status',existing.order_status);
 end if;
 if jsonb_array_length(p_items)=0 then raise exception 'Empty cart'; end if;
 if (p_order->>'total_uzs')::numeric is distinct from
   (select case when bool_and(value->>'unit_price_uzs' is not null) then sum((value->>'line_total_uzs')::numeric) else null end from jsonb_array_elements(p_items))
 then raise exception 'UZS total mismatch'; end if;
 insert into public.orders(order_code,telegram_user_id,telegram_username,telegram_verified,customer_language,customer_name,phone,backup_phone,address,comment,total,total_uzs,currency,payment_method,payment_status,order_status,lookup_token_hash,idempotency_key,request_hash)
 values(p_order->>'order_code',p_order->>'telegram_user_id',p_order->>'telegram_username',(p_order->>'telegram_verified')::boolean,coalesce(p_order->>'customer_language','uz'),p_order->>'customer_name',p_order->>'phone',p_order->>'backup_phone',p_order->>'address',p_order->>'comment',(p_order->>'total')::numeric,(p_order->>'total_uzs')::numeric,'USD','manual','awaiting_payment','awaiting_payment',p_order->>'lookup_token_hash',p_order->>'idempotency_key',p_order->>'request_hash') returning * into saved;
 for item in select * from jsonb_array_elements(p_items) loop
 insert into public.order_items(order_id,product_code,title,image,size,color,qty,unit_price,line_total,unit_price_uzs,line_total_uzs)
 values(saved.id,item->>'product_code',item->>'title',item->>'image',item->>'size',item->>'color',(item->>'qty')::integer,(item->>'unit_price')::numeric,(item->>'line_total')::numeric,(item->>'unit_price_uzs')::numeric,(item->>'line_total_uzs')::numeric);
 end loop;
 return jsonb_build_object('order_code',saved.order_code,'total',saved.total,'total_uzs',saved.total_uzs,'payment_status',saved.payment_status,'order_status',saved.order_status);
end $$;

revoke all on function public.burando_create_order(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.burando_create_order(jsonb,jsonb) to service_role;
