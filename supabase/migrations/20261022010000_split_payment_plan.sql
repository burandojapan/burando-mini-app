-- Staging first. Legacy orders remain full-payment orders; no historical totals change.
begin;
alter table public.orders add column if not exists payment_plan text not null default 'full';
alter table public.orders add column if not exists payment_phase text not null default 'deposit';
alter table public.orders add column if not exists exchange_rate numeric(14,6);
alter table public.orders add column if not exists exchange_date date;
alter table public.orders add column if not exists exchange_source text;
alter table public.orders add column if not exists deposit_uzs numeric(18,0);
alter table public.orders add column if not exists balance_uzs numeric(18,0);
alter table public.orders add column if not exists deposit_paid_at timestamptz;
alter table public.orders add column if not exists balance_paid_at timestamptz;
alter table public.orders add column if not exists deposit_receipt_path text;
alter table public.orders add column if not exists balance_receipt_path text;
alter table public.payment_audit add column if not exists installment text not null default 'full';
alter table public.payment_audit add column if not exists receipt_path text;
alter table public.orders drop constraint if exists orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check check(payment_status in
 ('pending','paid','failed','cancelled','refunded','awaiting_payment','receipt_submitted','under_review','rejected','deposit_paid'));
alter table public.orders add constraint split_payment_snapshot_valid check (
 payment_plan='full' or (payment_plan='split_50' and payment_phase in ('deposit','balance')
 and exchange_rate is not null and exchange_rate between 1000 and 100000 and exchange_date is not null and exchange_source is not null and exchange_source='CBU'
 and total_uzs is not null and total_uzs=round(total*exchange_rate)
 and deposit_uzs is not null and balance_uzs is not null and deposit_uzs>0 and balance_uzs>0
 and deposit_uzs=round(total_uzs/2) and deposit_uzs+balance_uzs=total_uzs
 and (deposit_paid_at is null or deposit_receipt_path is not null)
 and (balance_paid_at is null or (deposit_paid_at is not null and balance_receipt_path is not null))
 and (payment_status<>'paid' or balance_paid_at is not null)
 and (payment_status<>'deposit_paid' or (deposit_paid_at is not null and payment_phase='deposit'))
 and (payment_phase<>'balance' or deposit_paid_at is not null)));
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
   return jsonb_build_object('order_code',existing.order_code,'total',existing.total,'total_uzs',existing.total_uzs,'payment_status',existing.payment_status,'order_status',existing.order_status,'payment_plan',existing.payment_plan,'deposit_uzs',existing.deposit_uzs,'balance_uzs',existing.balance_uzs);
 end if;
 if jsonb_array_length(p_items)=0 then raise exception 'Empty cart'; end if;
 if coalesce(p_order->>'payment_plan','full') <> 'split_50' and (p_order->>'total_uzs')::numeric is distinct from
   (select case when bool_and(value->>'unit_price_uzs' is not null) then sum((value->>'line_total_uzs')::numeric) else null end from jsonb_array_elements(p_items))
 then raise exception 'UZS total mismatch'; end if;
 if coalesce(p_order->>'payment_plan','full')='split_50' then
  if (p_order->>'total_uzs')::numeric is distinct from round((p_order->>'total')::numeric*(p_order->>'exchange_rate')::numeric)
   or (p_order->>'deposit_uzs')::numeric is distinct from round((p_order->>'total_uzs')::numeric/2)
   or (p_order->>'balance_uzs')::numeric is distinct from (p_order->>'total_uzs')::numeric-(p_order->>'deposit_uzs')::numeric
   or (select sum((value->>'line_total')::numeric) from jsonb_array_elements(p_items)) is distinct from (p_order->>'total')::numeric
  then raise exception 'Split total mismatch'; end if;
 end if;
 insert into public.orders(payment_plan,exchange_rate,exchange_date,exchange_source,deposit_uzs,balance_uzs,order_code,telegram_user_id,telegram_username,telegram_verified,customer_language,customer_name,phone,backup_phone,address,comment,total,total_uzs,currency,payment_method,payment_status,order_status,lookup_token_hash,idempotency_key,request_hash)
 values(coalesce(p_order->>'payment_plan','full'),(p_order->>'exchange_rate')::numeric,(p_order->>'exchange_date')::date,p_order->>'exchange_source',(p_order->>'deposit_uzs')::numeric,(p_order->>'balance_uzs')::numeric,p_order->>'order_code',p_order->>'telegram_user_id',p_order->>'telegram_username',(p_order->>'telegram_verified')::boolean,coalesce(p_order->>'customer_language','uz'),p_order->>'customer_name',p_order->>'phone',p_order->>'backup_phone',p_order->>'address',p_order->>'comment',(p_order->>'total')::numeric,(p_order->>'total_uzs')::numeric,'USD','manual','awaiting_payment','awaiting_payment',p_order->>'lookup_token_hash',p_order->>'idempotency_key',p_order->>'request_hash') returning * into saved;
 for item in select * from jsonb_array_elements(p_items) loop
 insert into public.order_items(order_id,product_code,title,image,size,color,qty,unit_price,line_total,unit_price_uzs,line_total_uzs)
 values(saved.id,item->>'product_code',item->>'title',item->>'image',item->>'size',item->>'color',(item->>'qty')::integer,(item->>'unit_price')::numeric,(item->>'line_total')::numeric,(item->>'unit_price_uzs')::numeric,(item->>'line_total_uzs')::numeric);
 end loop;
 return jsonb_build_object('order_code',saved.order_code,'total',saved.total,'total_uzs',saved.total_uzs,'payment_status',saved.payment_status,'order_status',saved.order_status,'payment_plan',saved.payment_plan,'deposit_uzs',saved.deposit_uzs,'balance_uzs',saved.balance_uzs);
end $$;

create or replace function public.burando_payment_action(p_code text,p_version integer,p_action text,p_actor text,p_reason text default '',p_path text default '',p_token_hash text default '')
returns jsonb language plpgsql security invoker set search_path=public as $$
declare o public.orders; next_status text; old_path text;
begin
 select * into o from public.orders where order_code=p_code for update;
 if not found then raise exception 'Order not found'; end if;
 if o.payment_version <> p_version then raise exception 'Version conflict'; end if;
 if o.order_status in ('cancelled','delivered') then raise exception 'Order locked'; end if;
 if o.payment_plan='split_50' and o.payment_phase='balance' and
  (o.deposit_paid_at is null or o.order_status not in ('arrived_uz','out_for_delivery')) then raise exception 'Balance not due yet'; end if;
 if p_action='submit' then
   if o.lookup_token_hash is distinct from p_token_hash or p_token_hash='' then raise exception 'Unauthorized'; end if;
   if o.payment_status not in ('pending','awaiting_payment','receipt_submitted','rejected') then raise exception 'Receipt locked'; end if;
   if p_path='' then raise exception 'Missing receipt'; end if;
   next_status='receipt_submitted';
 elsif p_action='review' and o.payment_status='receipt_submitted' then next_status='under_review';
 elsif p_action='paid' and o.payment_status='under_review' and o.receipt_path is not null then
   next_status=case when o.payment_plan='split_50' and o.payment_phase='deposit' then 'deposit_paid' else 'paid' end;
 elsif p_action='reject' and o.payment_status='under_review' and length(trim(p_reason))>0 then next_status='rejected';
 else raise exception 'Invalid payment transition'; end if;
 old_path=o.receipt_path;
 update public.orders set payment_status=next_status,payment_version=payment_version+1,
 order_status=case when next_status in ('paid','deposit_paid') and order_status='awaiting_payment' then 'received' else order_status end,
 receipt_path=case when p_action='submit' then p_path else receipt_path end,
 deposit_paid_at=case when next_status='deposit_paid' then now() else deposit_paid_at end,
 deposit_receipt_path=case when next_status='deposit_paid' then o.receipt_path else deposit_receipt_path end,
 balance_paid_at=case when next_status='paid' and payment_plan='split_50' then now() else balance_paid_at end,
 balance_receipt_path=case when next_status='paid' and payment_plan='split_50' then o.receipt_path else balance_receipt_path end,
 updated_at=now() where id=o.id;
 insert into public.payment_audit(order_id,action,actor,previous_status,next_status,reason,installment,receipt_path)
 values(o.id,p_action,p_actor,o.payment_status,next_status,p_reason,case when o.payment_plan='split_50' then o.payment_phase else 'full' end,case when p_action='submit' then p_path else o.receipt_path end);
 return jsonb_build_object('ok',true,'payment_status',next_status,'old_path',old_path);
end $$;
create or replace function public.burando_delivery_action(p_code text,p_status text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare o public.orders; open_balance boolean;
begin
 if p_status not in ('received','preparing_japan','shipped_japan','in_transit','arrived_uz','out_for_delivery','delivered','cancelled') then raise exception 'Invalid delivery status'; end if;
 select * into o from public.orders where order_code=p_code for update;
 if not found then raise exception 'Order not found'; end if;
 if o.order_status in ('cancelled','delivered') and p_status<>o.order_status then raise exception 'Final delivery status locked'; end if;
 if p_status<>'cancelled' then
  if o.payment_plan='split_50' then
   if o.deposit_paid_at is null then raise exception 'Deposit must be verified first'; end if;
   if p_status in ('out_for_delivery','delivered') and o.balance_paid_at is null then raise exception 'Balance must be verified first'; end if;
   if o.payment_phase='balance' and p_status not in ('arrived_uz','out_for_delivery','delivered') then raise exception 'Arrival cannot be reversed'; end if;
  elsif o.payment_status<>'paid' then raise exception 'Payment must be verified first'; end if;
 end if;
 open_balance:=o.payment_plan='split_50' and p_status='arrived_uz' and o.payment_phase='deposit';
 update public.orders set order_status=p_status,
 payment_phase=case when open_balance then 'balance' else payment_phase end,
 payment_status=case when open_balance then 'awaiting_payment' else payment_status end,
 receipt_path=case when open_balance then null else receipt_path end,
 payment_version=payment_version+case when open_balance then 1 else 0 end,
 updated_at=now() where id=o.id returning * into o;
 return jsonb_build_object('ok',true,'order_code',o.order_code,'order_status',o.order_status);
end $$;
create or replace function public.burando_notice_text(p_event text,p_ru boolean) returns text
language sql immutable security invoker set search_path=public as $$
 select case p_event
 when 'created' then case when p_ru then 'Заказ создан. Ожидается оплата.' else 'Buyurtma yaratildi. To‘lov kutilmoqda.' end
 when 'payment:awaiting_payment' then case when p_ru then 'Ожидается оплата.' else 'To‘lov kutilmoqda.' end
 when 'payment:pending' then case when p_ru then 'Ожидается оплата.' else 'To‘lov kutilmoqda.' end
 when 'payment:receipt_submitted' then case when p_ru then 'Чек получен. Администратор проверит поступление денег. Это ещё не подтверждение оплаты.' else 'Chek olindi. Admin pul tushganini tekshiradi. Bu hali to‘lov tasdig‘i emas.' end
 when 'payment:under_review' then case when p_ru then 'Чек проверяется администратором.' else 'Chek admin tomonidan tekshirilmoqda.' end
 when 'payment:deposit_paid' then case when p_ru then 'Предоплата 50% подтверждена. Остаток — после прибытия в Узбекистан.' else '50% oldindan to‘lov tasdiqlandi. Qolgan qismi O‘zbekistonga kelgandan keyin.' end
 when 'payment:paid' then case when p_ru then 'Поступление оплаты подтверждено администратором.' else 'Pul tushgani admin tomonidan tasdiqlandi.' end
 when 'payment:rejected' then case when p_ru then 'Чек отклонён. Причина и замена чека доступны в заказе.' else 'Chek rad etildi. Sababini buyurtmada ko‘ring va kerak bo‘lsa chekni almashtiring.' end
 when 'delivery:awaiting_payment' then case when p_ru then 'Заказ ожидает оплаты.' else 'Buyurtma to‘lov kutilmoqda holatida.' end
 when 'delivery:received' then case when p_ru then 'Заказ принят.' else 'Buyurtma qabul qilindi.' end
 when 'delivery:preparing_japan' then case when p_ru then 'Заказ готовится в Японии.' else 'Buyurtma Yaponiyada tayyorlanmoqda.' end
 when 'delivery:shipped_japan' then case when p_ru then 'Заказ отправлен из Японии.' else 'Buyurtma Yaponiyadan yuborildi.' end
 when 'delivery:in_transit' then case when p_ru then 'Заказ в пути.' else 'Buyurtma yo‘lda.' end
 when 'delivery:arrived_uz' then case when p_ru then 'Заказ прибыл в Узбекистан.' else 'Buyurtma O‘zbekistonga keldi.' end
 when 'delivery:out_for_delivery' then case when p_ru then 'Заказ передан на доставку.' else 'Buyurtma sizga yetkazilmoqda.' end
 when 'delivery:delivered' then case when p_ru then 'Заказ доставлен. Спасибо за покупку!' else 'Buyurtma yetkazildi. Xaridingiz uchun rahmat!' end
 when 'delivery:cancelled' then case when p_ru then 'Заказ отменён.' else 'Buyurtma bekor qilindi.' end
 else case when p_ru then 'Статус заказа обновлён. Подробности в приложении.' else 'Buyurtma holati yangilandi. Tafsilotlar ilovada.' end end
$$;
revoke all on function public.burando_notice_text(text,boolean) from public,anon,authenticated;
grant execute on function public.burando_notice_text(text,boolean) to service_role;

create or replace function public.burando_queue_order_notice() returns trigger
language plpgsql security invoker set search_path=public as $$
declare events text[]:='{}'; event text; amount text; prefix text;
begin
 if tg_op='INSERT' then events:=array['created'];
 else
  if new.payment_status is distinct from old.payment_status or
    (new.receipt_path is distinct from old.receipt_path and new.receipt_path is not null) then
   events:=array_append(events,'payment:'||new.payment_status);
  end if;
  if new.order_status is distinct from old.order_status then
   events:=array_append(events,'delivery:'||new.order_status);
  end if;
 end if;
 amount:=E'\nUSD '||new.total::text||case when new.total_uzs is not null then E'\n'||new.total_uzs::text||' so‘m' else '' end;
 if new.payment_plan='split_50' then
  amount:=amount||E'\n50%: '||new.deposit_uzs::text||' so‘m · 50%: '||new.balance_uzs::text||' so‘m'||E'\n'||case when new.payment_phase='balance' then '2/2 · O‘zbekistonga keldi / Прибыл в Узбекистан' else '1/2 · Oldindan to‘lov / Предоплата' end;
 end if;
 prefix:='BURANDO · '||new.order_code||E'\n';
 foreach event in array events loop
  insert into public.notification_outbox(order_id,audience,message)
   values(new.id,'admin',prefix||public.burando_notice_text(event,false)||amount);
  if new.telegram_verified and coalesce(new.telegram_user_id,'') ~ '^[1-9][0-9]*$' then
   insert into public.notification_outbox(order_id,audience,message,telegram_user_id)
    values(new.id,'customer',prefix||public.burando_notice_text(event,new.customer_language='ru')||amount,new.telegram_user_id);
  end if;
 end loop;
 return new;
end $$;
revoke all on function public.burando_queue_order_notice() from public,anon,authenticated;
grant execute on function public.burando_queue_order_notice() to service_role;


revoke all on function public.burando_create_order(jsonb,jsonb),public.burando_payment_action(text,integer,text,text,text,text,text),public.burando_delivery_action(text,text) from public,anon,authenticated;
grant execute on function public.burando_create_order(jsonb,jsonb),public.burando_payment_action(text,integer,text,text,text,text,text),public.burando_delivery_action(text,text) to service_role;
commit;
