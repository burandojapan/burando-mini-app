-- Additive, staging first. No customer/order rows are rewritten or deleted.
begin;
create table if not exists public.notification_config (
 id integer primary key check(id=1),
 enabled boolean not null default false,
 admin_chat_id text not null default '',
 test_recipient_ids jsonb not null default '[]'::jsonb check(jsonb_typeof(test_recipient_ids)='array'),
 enabled_since timestamptz,
 check(not enabled or (admin_chat_id<>'' and enabled_since is not null))
);
insert into public.notification_config(id) values(1) on conflict(id) do nothing;
alter table public.notification_config enable row level security;
revoke all on public.notification_config from public,anon,authenticated;
grant select,update on public.notification_config to service_role;

create or replace function public.burando_notice_text(p_event text,p_ru boolean) returns text
language sql immutable security invoker set search_path=public as $$
 select case p_event
 when 'created' then case when p_ru then 'Заказ создан. Ожидается оплата.' else 'Buyurtma yaratildi. To‘lov kutilmoqda.' end
 when 'payment:awaiting_payment' then case when p_ru then 'Ожидается оплата.' else 'To‘lov kutilmoqda.' end
 when 'payment:pending' then case when p_ru then 'Ожидается оплата.' else 'To‘lov kutilmoqda.' end
 when 'payment:receipt_submitted' then case when p_ru then 'Чек получен. Администратор проверит поступление денег. Это ещё не подтверждение оплаты.' else 'Chek olindi. Admin pul tushganini tekshiradi. Bu hali to‘lov tasdig‘i emas.' end
 when 'payment:under_review' then case when p_ru then 'Чек проверяется администратором.' else 'Chek admin tomonidan tekshirilmoqda.' end
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

create or replace function public.burando_claim_notification_since(p_since timestamptz) returns jsonb
language plpgsql security invoker set search_path=public as $$
declare item public.notification_outbox;
begin
 if p_since is null then return null; end if;
 select * into item from public.notification_outbox
 where created_at>=p_since and attempts<5 and
 ((status='pending' and available_at<=now()) or (status='sending' and lease_until<now()))
 order by id for update skip locked limit 1;
 if not found then return null; end if;
 update public.notification_outbox set status='sending',attempts=attempts+1,
  lease_until=now()+interval '2 minutes' where id=item.id returning * into item;
 return to_jsonb(item);
end $$;
revoke all on function public.burando_claim_notification_since(timestamptz) from public,anon,authenticated;
grant execute on function public.burando_claim_notification_since(timestamptz) to service_role;
commit;
