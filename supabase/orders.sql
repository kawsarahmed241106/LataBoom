-- Run in Supabase Dashboard > SQL Editor as postgres.
-- Customer tracking is exposed only through a phone + order-number lookup RPC.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null default '',
  customer_email text not null default '',
  order_number text not null unique check (char_length(trim(order_number)) between 1 and 40),
  phone text not null check (char_length(trim(phone)) between 7 and 24),
  delivery_address text not null default '',
  delivery_area text not null default '',
  delivery_charge numeric(12, 2) not null default 0 check (delivery_charge >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled')),
  status_note text not null default '',
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  estimated_delivery date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists customer_name text not null default '';
alter table public.orders add column if not exists customer_email text not null default '';
alter table public.orders add column if not exists delivery_address text not null default '';
alter table public.orders add column if not exists delivery_area text not null default '';
alter table public.orders add column if not exists delivery_charge numeric(12, 2) not null default 0;
alter table public.orders add column if not exists total_amount numeric(12, 2) not null default 0;

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id bigint references public.products(id) on delete set null,
  item_name text not null,
  image_url text not null default '',
  tier_quantity text not null default '',
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now()
);

-- Checkout creates an order using catalog prices and a server-generated order number.
create or replace function public.place_customer_order(
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_delivery_address text,
  p_delivery_area text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := trim(coalesce(p_customer_name, ''));
  v_email text := lower(trim(coalesce(p_customer_email, '')));
  v_phone text := trim(coalesce(p_customer_phone, ''));
  v_address text := trim(coalesce(p_delivery_address, ''));
  v_area text := trim(coalesce(p_delivery_area, ''));
  v_delivery_charge numeric(12, 2);
  v_subtotal numeric(12, 2) := 0;
  v_order_id uuid;
  v_order_number text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_tier jsonb;
  v_tier_count integer;
  v_tier_label text;
  v_quantity integer;
  v_regular_price numeric(12, 2);
  v_special_price numeric(12, 2);
  v_unit_price numeric(12, 2);
begin
  if auth.uid() is not null and exists (
    select 1 from auth.users
    where id = auth.uid() and raw_app_meta_data ->> 'role' = 'admin'
  ) then
    raise exception 'Admin accounts cannot place customer orders.';
  end if;
  if char_length(v_name) not between 1 and 100 then raise exception 'Enter your full name.'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email address.'; end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) not between 7 and 15 then raise exception 'Enter a valid phone number.'; end if;
  if char_length(v_address) not between 5 and 600 then raise exception 'Enter a valid delivery address.'; end if;
  v_delivery_charge := case v_area
    when 'inside_dhaka' then 60
    when 'sub_dhaka' then 70
    when 'outside_dhaka' then 100
    else null
  end;
  if v_delivery_charge is null then raise exception 'Choose a valid delivery area.'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Your cart is empty or invalid.';
  end if;
  if jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'Your cart is empty or contains too many items.';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) as submitted(value) loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::bigint;
    if not found then raise exception 'A product in your cart is no longer available.'; end if;
    v_quantity := (v_item ->> 'quantity')::integer;
    if v_quantity is null or v_quantity not between 1 and 99 then raise exception 'Product quantity must be between 1 and 99.'; end if;
    v_tier_label := trim(coalesce(v_item ->> 'tier_quantity', ''));
    v_tier_count := jsonb_array_length(coalesce(v_product.quantity_prices, '[]'::jsonb));
    if v_tier_count > 0 then
      if v_tier_label = '' and v_tier_count = 1 then
        v_tier := v_product.quantity_prices -> 0;
      else
        select tier.value into v_tier
        from jsonb_array_elements(v_product.quantity_prices) as tier(value)
        where trim(coalesce(tier.value ->> 'quantity', '')) = v_tier_label
        limit 1;
      end if;
      if v_tier is null then raise exception 'Choose a valid product quantity option.'; end if;
      if not coalesce((v_tier ->> 'in_stock')::boolean, v_product.in_stock) then raise exception 'A product option in your cart is out of stock.'; end if;
      v_regular_price := coalesce(nullif(v_tier ->> 'regular_price', '')::numeric, nullif(v_tier ->> 'price', '')::numeric);
      v_special_price := nullif(v_tier ->> 'special_price', '')::numeric;
      v_tier_label := coalesce(nullif(trim(v_tier ->> 'quantity'), ''), v_tier_label);
    else
      if v_tier_label <> '' then raise exception 'A product option in your cart is no longer available.'; end if;
      if not v_product.in_stock then raise exception 'A product in your cart is out of stock.'; end if;
      v_regular_price := coalesce(v_product.regular_price, v_product.price);
      v_special_price := v_product.special_price;
    end if;
    if v_regular_price is null or v_regular_price <= 0 then raise exception 'A product price is not configured.'; end if;
    v_unit_price := case when v_special_price > 0 and v_special_price < v_regular_price then v_special_price else v_regular_price end;
    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
  end loop;

  v_order_number := 'LB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.orders (
    user_id, customer_name, customer_email, order_number, phone, delivery_address,
    delivery_area, delivery_charge, total_amount
  ) values (
    auth.uid(), v_name, v_email, v_order_number, v_phone, v_address,
    v_area, v_delivery_charge, v_subtotal + v_delivery_charge
  ) returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) as submitted(value) loop
    select * into v_product from public.products where id = (v_item ->> 'product_id')::bigint;
    v_quantity := (v_item ->> 'quantity')::integer;
    v_tier_label := trim(coalesce(v_item ->> 'tier_quantity', ''));
    v_tier_count := jsonb_array_length(coalesce(v_product.quantity_prices, '[]'::jsonb));
    if v_tier_count > 0 then
      if v_tier_label = '' and v_tier_count = 1 then v_tier := v_product.quantity_prices -> 0;
      else
        select tier.value into v_tier
        from jsonb_array_elements(v_product.quantity_prices) as tier(value)
        where trim(coalesce(tier.value ->> 'quantity', '')) = v_tier_label
        limit 1;
      end if;
      v_regular_price := coalesce(nullif(v_tier ->> 'regular_price', '')::numeric, nullif(v_tier ->> 'price', '')::numeric);
      v_special_price := nullif(v_tier ->> 'special_price', '')::numeric;
      v_tier_label := coalesce(nullif(trim(v_tier ->> 'quantity'), ''), v_tier_label);
    else
      v_regular_price := coalesce(v_product.regular_price, v_product.price);
      v_special_price := v_product.special_price;
    end if;
    v_unit_price := case when v_special_price > 0 and v_special_price < v_regular_price then v_special_price else v_regular_price end;
    insert into public.order_items (order_id, product_id, item_name, image_url, tier_quantity, unit_price, quantity)
    values (v_order_id, v_product.id, v_product.name, v_product.image_url, v_tier_label, v_unit_price, v_quantity);
  end loop;

  return jsonb_build_object(
    'order_number', v_order_number,
    'status', 'pending',
    'subtotal', v_subtotal,
    'delivery_charge', v_delivery_charge,
    'total_amount', v_subtotal + v_delivery_charge
  );
end;
$$;

revoke all on function public.place_customer_order(text, text, text, text, text, jsonb) from public;
grant execute on function public.place_customer_order(text, text, text, text, text, jsonb) to anon, authenticated;

-- Keep product popularity tied to completed/active orders, not cart additions.
create or replace function public.refresh_product_sales_count(target_product_id bigint)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.products as product
  set sales_count = coalesce((
    select sum(item.quantity)::integer
    from public.order_items as item
    join public.orders as customer_order on customer_order.id = item.order_id
    where item.product_id = target_product_id
      and customer_order.status in ('confirmed', 'processing', 'shipped', 'delivered')
  ), 0)
  where product.id = target_product_id;
$$;

create or replace function public.sync_product_sales_from_order_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.product_id is not null then
    perform public.refresh_product_sales_count(old.product_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.product_id is not null
     and (tg_op = 'INSERT' or new.product_id is distinct from old.product_id) then
    perform public.refresh_product_sales_count(new.product_id);
  elsif tg_op = 'UPDATE' and new.product_id is not null then
    perform public.refresh_product_sales_count(new.product_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.sync_product_sales_from_order_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  affected_product record;
begin
  if new.status is distinct from old.status then
    for affected_product in
      select distinct product_id from public.order_items
      where order_id = new.id and product_id is not null
    loop
      perform public.refresh_product_sales_count(affected_product.product_id);
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function public.refresh_product_sales_count(bigint) from public, anon, authenticated;
revoke all on function public.sync_product_sales_from_order_item() from public, anon, authenticated;
revoke all on function public.sync_product_sales_from_order_status() from public, anon, authenticated;

drop trigger if exists order_items_sync_product_sales on public.order_items;
create trigger order_items_sync_product_sales
  after insert or update or delete on public.order_items
  for each row execute function public.sync_product_sales_from_order_item();

drop trigger if exists orders_sync_product_sales on public.orders;
create trigger orders_sync_product_sales
  after update of status on public.orders
  for each row execute function public.sync_product_sales_from_order_status();

update public.products as product
set sales_count = coalesce((
  select sum(item.quantity)::integer
  from public.order_items as item
  join public.orders as customer_order on customer_order.id = item.order_id
  where item.product_id = product.id
    and customer_order.status in ('confirmed', 'processing', 'shipped', 'delivered')
), 0);

alter table public.orders enable row level security;
create unique index if not exists orders_order_number_normalized_idx
  on public.orders (lower(trim(order_number)));
revoke all on table public.orders from anon, authenticated;
grant select, insert, update, delete on table public.orders to authenticated;

drop policy if exists "Admins manage orders" on public.orders;
create policy "Admins manage orders"
  on public.orders for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Customers read their own orders" on public.orders;
create policy "Customers read their own orders"
  on public.orders for select to authenticated
  using (user_id = auth.uid());

alter table public.order_items enable row level security;
revoke all on table public.order_items from anon, authenticated;
grant select, insert, update, delete on table public.order_items to authenticated;

drop policy if exists "Admins manage order items" on public.order_items;
create policy "Admins manage order items"
  on public.order_items for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Customers read their own order items" on public.order_items;
create policy "Customers read their own order items"
  on public.order_items for select to authenticated
  using (exists (
    select 1 from public.orders
    where orders.id = order_items.order_id and orders.user_id = auth.uid()
  ));

create or replace function public.set_order_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_order_updated_at();
revoke all on function public.set_order_updated_at() from public, anon, authenticated;

create or replace function public.track_order_by_reference(lookup_phone text, lookup_order_number text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when length(regexp_replace(coalesce(lookup_phone, ''), '\D', '', 'g')) not between 7 and 15
      or char_length(trim(coalesce(lookup_order_number, ''))) = 0 then null
    else (
      select jsonb_build_object(
        'order_number', customer_order.order_number,
        'status', customer_order.status,
        'status_note', customer_order.status_note,
        'total_amount', customer_order.total_amount,
        'estimated_delivery', customer_order.estimated_delivery,
        'created_at', customer_order.created_at,
        'updated_at', customer_order.updated_at
      )
      from public.orders as customer_order
      where regexp_replace(customer_order.phone, '\D', '', 'g') = regexp_replace(lookup_phone, '\D', '', 'g')
        and lower(trim(customer_order.order_number)) = lower(trim(lookup_order_number))
      limit 1
    )
  end;
$$;

revoke all on function public.track_order_by_reference(text, text) from public;
grant execute on function public.track_order_by_reference(text, text) to anon, authenticated;
