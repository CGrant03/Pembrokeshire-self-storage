create table public.storage_enquiries (
id uuid primary key, created_at timestamptz not null default now(),
full_name text not null check(length(trim(full_name)) between 1 and 120),
contact text not null check(length(trim(contact)) between 3 and 160),
preferred_date date, requirements text not null check(length(trim(requirements)) between 1 and 1500),
status text not null default 'new' check(status in ('new','contacted','closed')),
website text not null default '' check(website=''));
alter table public.storage_enquiries enable row level security;
revoke all on public.storage_enquiries from anon,authenticated;
grant insert(id,full_name,contact,preferred_date,requirements,website) on public.storage_enquiries to anon,authenticated;
grant select,update on public.storage_enquiries to authenticated;
create policy "Submit enquiries only" on public.storage_enquiries for insert to anon,authenticated with check(status='new' and website='');
create policy "Staff read enquiries" on public.storage_enquiries for select to authenticated using(public.is_staff());
create policy "Staff update enquiries" on public.storage_enquiries for update to authenticated using(public.is_staff()) with check(public.is_staff());