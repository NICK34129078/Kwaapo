-- Fix buyer ship notification trigger: order_items has no product_name column.
-- Join products.name instead so seller ship updates no longer fail at trigger time.

create or replace function public.notify_buyer_order_shipped()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product_name text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.shipping_status = new.shipping_status then
    return new;
  end if;

  if new.shipping_status <> 'shipped' then
    return new;
  end if;

  if new.payment_status <> 'paid' then
    return new;
  end if;

  select p.name
  into v_product_name
  from public.order_items oi
  join public.products p on p.id = oi.product_id
  where oi.order_id = new.id
  order by oi.created_at asc
  limit 1;

  insert into public.buyer_notifications (
    buyer_id,
    order_id,
    notification_type,
    title,
    body,
    product_name
  )
  values (
    new.buyer_id,
    new.id,
    'order_shipped',
    'Je bestelling is verzonden',
    coalesce(
      'Goed nieuws: ' || nullif(trim(v_product_name), '') || ' is onderweg.',
      'Je bestelling is onderweg.'
    ),
    nullif(trim(v_product_name), '')
  )
  on conflict (buyer_id, order_id, notification_type) do nothing;

  return new;
end;
$$;

notify pgrst, 'reload schema';
