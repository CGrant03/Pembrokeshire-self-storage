
alter table public.storage_enquiries add column phone text;
alter table public.storage_enquiries add constraint storage_enquiry_phone_format check(phone is null or (length(phone)<=30 and phone ~ '^\+?[0-9 ()-]+$' and length(regexp_replace(phone,'[^0-9]','','g')) between 10 and 15));
grant insert(phone) on public.storage_enquiries to anon,authenticated;
create function private.require_enquiry_phone() returns trigger language plpgsql set search_path='' as $$
begin
 if new.phone is null then raise exception 'A phone number is required'; end if;
 return new;
end; $$;
revoke all on function private.require_enquiry_phone() from public,anon,authenticated;
create trigger storage_enquiry_phone_required before insert on public.storage_enquiries for each row execute function private.require_enquiry_phone();
create or replace function private.queue_enquiry_email() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.enquiry_email_queue(enquiry_id,payload)
 values(new.id,jsonb_build_object('full_name',new.full_name,'contact',new.contact || case when new.phone is not null and new.phone<>new.contact then E'\nPhone: '||new.phone else '' end,'preferred_date',new.preferred_date,'requirements',new.requirements,'created_at',new.created_at));
 return new;
end; $$;
