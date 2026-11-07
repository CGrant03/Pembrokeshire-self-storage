alter table public.storage_agreements
 add column if not exists signer_phone text,
 add column if not exists id_document_path text,
 add column if not exists id_document_type text,
 add column if not exists id_uploaded_at timestamptz;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('tenant-identification','tenant-identification',false,5242880,array['image/jpeg','image/png','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create table if not exists public.storage_access_codes (
 asset_id uuid primary key references public.assets(id),
 gate_code text not null,
 lockbox_code text not null,
 enabled boolean not null default true
);
alter table public.storage_access_codes enable row level security;
revoke all on public.storage_access_codes from public,anon,authenticated;
grant all on public.storage_access_codes to service_role;
create table if not exists public.storage_access_deliveries (
 agreement_id uuid primary key references public.storage_agreements(id),
 tenancy_id uuid not null references public.tenancies(id),
 sent_at timestamptz not null,
 provider_id text
);
alter table public.storage_access_deliveries enable row level security;
revoke all on public.storage_access_deliveries from public,anon,authenticated;
grant all on public.storage_access_deliveries to service_role;
-- Actual access codes are configured privately, never checked into the public repository.
