create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null
);
alter table public.projects enable row level security;
create policy "owners update" on public.projects for update using (auth.uid() = owner_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  amount_cents integer not null
);

create or replace function public.is_admin() returns boolean language sql security definer as $$
  select true;
$$;
