
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table public.enquiry_email_queue (
 enquiry_id uuid primary key references public.storage_enquiries(id),
 token uuid not null default gen_random_uuid(),
 payload jsonb not null,
 created_at timestamptz not null default now(),
 attempts integer not null default 0,
 last_attempt_at timestamptz,
 sent_at timestamptz,
 provider_id text,
 last_error text
);
alter table public.enquiry_email_queue enable row level security;
revoke all on public.enquiry_email_queue from public,anon,authenticated;
grant all on public.enquiry_email_queue to service_role;
create function private.queue_enquiry_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
 insert into public.enquiry_email_queue(enquiry_id,payload)
 values(new.id,jsonb_build_object('full_name',new.full_name,'contact',new.contact,'preferred_date',new.preferred_date,'requirements',new.requirements,'created_at',new.created_at));
 return new;
end; $$;
revoke all on function private.queue_enquiry_email() from public,anon,authenticated;
create trigger storage_enquiry_email after insert on public.storage_enquiries
for each row execute function private.queue_enquiry_email();
create function private.dispatch_enquiry_emails() returns void
language plpgsql security definer set search_path = '' as $$
declare dispatched bigint;
begin
 with due as (
 select enquiry_id from public.enquiry_email_queue
 where sent_at is null and attempts < 12 and created_at > now()-interval '23 hours'
 and (last_attempt_at is null or last_attempt_at < now()-interval '5 minutes')
 order by created_at limit 5 for update skip locked
 ), claimed as (
 update public.enquiry_email_queue q set attempts=q.attempts+1,last_attempt_at=now()
 from due where q.enquiry_id=due.enquiry_id returning q.enquiry_id,q.token
 )
 select count(net.http_post(
 url:='https://vxurmlmmrlclfydiobgm.supabase.co/functions/v1/enquiry-notification',
 headers:='{"Content-Type":"application/json"}'::jsonb,
 body:=jsonb_build_object('id',enquiry_id,'token',token),timeout_milliseconds:=15000
 )) into dispatched from claimed;
end; $$;
revoke all on function private.dispatch_enquiry_emails() from public,anon,authenticated;
select cron.schedule('storage-enquiry-email-delivery','* * * * *','select private.dispatch_enquiry_emails();');
