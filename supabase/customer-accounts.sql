-- Run in Supabase Dashboard > SQL Editor as postgres after products.sql and orders.sql.
-- Customer profile and cart rows are private to their authenticated owner.

create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_profiles
  add column if not exists delivery_address text not null default '',
  add column if not exists delivery_area text not null default '';

insert into public.customer_profiles (user_id, full_name, phone)
select id, coalesce(raw_user_meta_data ->> 'full_name', ''), coalesce(raw_user_meta_data ->> 'phone', phone, '')
from auth.users
where coalesce(raw_app_meta_data ->> 'role', '') <> 'admin'
on conflict (user_id) do nothing;

delete from public.customer_profiles as profile
using auth.users as account_user
where profile.user_id = account_user.id
  and account_user.raw_app_meta_data ->> 'role' = 'admin';

create or replace function public.create_customer_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.raw_app_meta_data ->> 'role' = 'admin' then
    delete from public.customer_profiles where user_id = new.id;
    return new;
  end if;
  insert into public.customer_profiles (user_id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone, '')
  )
  on conflict (user_id) do update
    set full_name = excluded.full_name,
        phone = excluded.phone,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_customer_profile on auth.users;
create trigger on_auth_user_created_customer_profile
  after insert on auth.users
  for each row execute function public.create_customer_profile_for_auth_user();
revoke all on function public.create_customer_profile_for_auth_user() from public, anon, authenticated;

alter table public.customer_profiles enable row level security;
revoke all on table public.customer_profiles from anon, authenticated;
grant select, insert, update on table public.customer_profiles to authenticated;

drop policy if exists "Customers read own profile" on public.customer_profiles;
create policy "Customers read own profile"
  on public.customer_profiles for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "Customers create own profile" on public.customer_profiles;
create policy "Customers create own profile"
  on public.customer_profiles for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "Customers update own profile" on public.customer_profiles;
create policy "Customers update own profile"
  on public.customer_profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.customer_cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  product_name text not null,
  image_url text not null default '',
  tier_quantity text not null default '',
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id, tier_quantity)
);

alter table public.customer_cart_items enable row level security;
revoke all on table public.customer_cart_items from anon, authenticated;
grant select, insert, update, delete on table public.customer_cart_items to authenticated;

drop policy if exists "Customers manage their own cart" on public.customer_cart_items;
create policy "Customers manage their own cart"
  on public.customer_cart_items for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists customer_cart_items_set_updated_at on public.customer_cart_items;
create trigger customer_cart_items_set_updated_at
  before update on public.customer_cart_items
  for each row execute function public.set_order_updated_at();
