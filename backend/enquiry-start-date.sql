create or replace function private.require_enquiry_date_email() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.preferred_date is null or new.preferred_date < (now() at time zone 'Europe/London')::date then
  raise exception 'Choose a preferred storage start date, today or later.';
 end if;
 if new.contact is null or new.contact !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
  raise exception 'Enter an email address so we can send your agreement and payment link.';
 end if;
 return new;
end; $$;
revoke all on function private.require_enquiry_date_email() from public,anon,authenticated;
create trigger storage_enquiry_date_email_required before insert on public.storage_enquiries
for each row execute function private.require_enquiry_date_email();
