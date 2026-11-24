create table if not exists public.products (
  id text primary key,
  name text not null,
  description text not null default '',
  price numeric(12, 2) not null check (price >= 0),
  discount_percent numeric(5, 2) not null default 0
    check (discount_percent between 0 and 100),
  stock integer not null default 0 check (stock >= 0),
  category text not null,
  image_url text not null,
  image_path text not null,
  created_at timestamptz not null default now()
);

alter table public.products
  add column if not exists discount_percent numeric(5, 2) not null default 0
  check (discount_percent between 0 and 100);

alter table public.products enable row level security;

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

drop policy if exists "Bathly products are visible to everyone" on public.products;
create policy "Bathly products are visible to everyone"
  on public.products
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Bathly admin can insert products" on public.products;
create policy "Bathly admin can insert products"
  on public.products
  for insert
  to authenticated
  with check (lower((select auth.jwt() ->> 'email')) = 'shehabmuo@gmail.com');

drop policy if exists "Bathly admin can update products" on public.products;
create policy "Bathly admin can update products"
  on public.products
  for update
  to authenticated
  using (lower((select auth.jwt() ->> 'email')) = 'shehabmuo@gmail.com')
  with check (lower((select auth.jwt() ->> 'email')) = 'shehabmuo@gmail.com');

drop policy if exists "Bathly admin can delete products" on public.products;
create policy "Bathly admin can delete products"
  on public.products
  for delete
  to authenticated
  using (lower((select auth.jwt() ->> 'email')) = 'shehabmuo@gmail.com');

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'bathly-products',
  'bathly-products',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Bathly product images are public" on storage.objects;
create policy "Bathly product images are public"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'bathly-products');

drop policy if exists "Bathly admin can upload product images" on storage.objects;
create policy "Bathly admin can upload product images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'bathly-products'
    and lower((select auth.jwt() ->> 'email')) = 'shehabmuo@gmail.com'
  );

drop policy if exists "Bathly admin can update product images" on storage.objects;
create policy "Bathly admin can update product images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'bathly-products'
    and lower((select auth.jwt() ->> 'email')) = 'shehabmuo@gmail.com'
  )
  with check (
    bucket_id = 'bathly-products'
    and lower((select auth.jwt() ->> 'email')) = 'shehabmuo@gmail.com'
  );

drop policy if exists "Bathly admin can delete product images" on storage.objects;
create policy "Bathly admin can delete product images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'bathly-products'
    and lower((select auth.jwt() ->> 'email')) = 'shehabmuo@gmail.com'
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
end
$$;

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  offer_price numeric(12, 2) check (offer_price is null or offer_price >= 0),
  created_at timestamptz not null default now()
);

alter table public.promotions
  add column if not exists offer_price numeric(12, 2)
  check (offer_price is null or offer_price >= 0);

alter table public.promotions enable row level security;

grant select on public.promotions to anon, authenticated;
grant insert, delete on public.promotions to authenticated;

drop policy if exists "Bathly promotions are visible to everyone" on public.promotions;
create policy "Bathly promotions are visible to everyone"
  on public.promotions
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Bathly admin can insert promotions" on public.promotions;
create policy "Bathly admin can insert promotions"
  on public.promotions
  for insert
  to authenticated
  with check (lower((select auth.jwt() ->> 'email')) = 'shehabmuo@gmail.com');

drop policy if exists "Bathly admin can delete promotions" on public.promotions;
create policy "Bathly admin can delete promotions"
  on public.promotions
  for delete
  to authenticated
  using (lower((select auth.jwt() ->> 'email')) = 'shehabmuo@gmail.com');

create table if not exists public.promotion_products (
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  product_id text not null references public.products(id) on delete cascade,
  primary key (promotion_id, product_id)
);

alter table public.promotion_products enable row level security;

grant select on public.promotion_products to anon, authenticated;
grant insert, delete on public.promotion_products to authenticated;

drop policy if exists "Promotion products are visible to everyone" on public.promotion_products;
create policy "Promotion products are visible to everyone"
  on public.promotion_products
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Bathly admin can add promotion products" on public.promotion_products;
create policy "Bathly admin can add promotion products"
  on public.promotion_products
  for insert
  to authenticated
  with check (lower((select auth.jwt() ->> 'email')) = 'shehabmuo@gmail.com');

drop policy if exists "Bathly admin can delete promotion products" on public.promotion_products;
create policy "Bathly admin can delete promotion products"
  on public.promotion_products
  for delete
  to authenticated
  using (lower((select auth.jwt() ->> 'email')) = 'shehabmuo@gmail.com');

create table if not exists public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  display_name text not null default 'زائر'
    check (char_length(btrim(display_name)) between 1 and 40),
  content text not null
    check (char_length(btrim(content)) between 3 and 500),
  created_at timestamptz not null default now()
);

alter table public.customer_reviews enable row level security;

grant select, insert on public.customer_reviews to anon, authenticated;
grant delete on public.customer_reviews to authenticated;

drop policy if exists "Customer reviews are visible to everyone" on public.customer_reviews;
create policy "Customer reviews are visible to everyone"
  on public.customer_reviews
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can submit a customer review" on public.customer_reviews;
create policy "Anyone can submit a customer review"
  on public.customer_reviews
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Bathly admin can delete customer reviews" on public.customer_reviews;
create policy "Bathly admin can delete customer reviews"
  on public.customer_reviews
  for delete
  to authenticated
  using (lower((select auth.jwt() ->> 'email')) = 'shehabmuo@gmail.com');
