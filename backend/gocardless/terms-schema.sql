alter table public.gocardless_connections
 add column plan jsonb,
 add column setup_token uuid unique,
 add column terms_accepted_at timestamptz;
