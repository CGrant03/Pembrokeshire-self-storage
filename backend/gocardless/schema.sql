create table public.gocardless_connections (
 tenancy_id uuid primary key references public.tenancies(id) on delete restrict,
 billing_request_id text unique, billing_status text not null default 'not_started',
 mandate_id text unique, mandate_status text, customer_id text, setup_url text,
 updated_at timestamptz not null default now()
);
create table public.gocardless_payment_status (
 payment_id text primary key, tenancy_id uuid not null references public.tenancies(id) on delete restrict,
 amount_pence integer not null, currency text not null, status text not null, charge_date date,
 updated_at timestamptz not null default now()
);
alter table public.gocardless_connections enable row level security;
alter table public.gocardless_payment_status enable row level security;
revoke all on public.gocardless_connections,public.gocardless_payment_status from anon,authenticated;
grant select on public.gocardless_connections,public.gocardless_payment_status to authenticated;
grant all on public.gocardless_connections,public.gocardless_payment_status to service_role;
create policy staff_read_connections on public.gocardless_connections for select to authenticated using (public.is_staff());
create policy staff_read_gc_payments on public.gocardless_payment_status for select to authenticated using (public.is_staff());
create index on public.gocardless_payment_status(tenancy_id);
