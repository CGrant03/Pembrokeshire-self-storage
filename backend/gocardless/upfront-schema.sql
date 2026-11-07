alter table public.gocardless_connections
 add column if not exists first_payment_id text unique,
 add column if not exists first_payment_status text,
 add column if not exists subscription_id text unique,
 add column if not exists subscription_status text,
 add column if not exists billing_error text;
alter table public.tenancies drop constraint tenancies_payment_day_check;
alter table public.tenancies add constraint tenancies_payment_day_check check(payment_day between 1 and 31);
create or replace function public.prepare_storage_enquiry(p_enquiry uuid,p_asset uuid,p_start date,p_total integer,p_first date,p_email text,p_phone text)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.storage_enquiries%rowtype; a public.assets%rowtype; cid uuid; tid uuid; matches integer; ids uuid[];
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff access required'; end if;
 select * into e from public.storage_enquiries where id=p_enquiry for update;
 if not found then raise exception 'Enquiry not found'; end if;
 if e.tenancy_id is not null then return e.tenancy_id; end if;
 if e.status='closed' then raise exception 'Reopen this enquiry before setting up storage'; end if;
 if p_start is null or p_total is null or p_total<1 or p_total>1000000 or p_first is null or p_first<current_date+8 or extract(day from p_first)>31 or p_first<p_start then raise exception 'Check rent, start date and first collection (at least 8 days ahead, day 1–31)'; end if;
 if p_phone is null or p_phone !~ '^\+?[0-9 ()-]+$' or length(regexp_replace(p_phone,'[^0-9]','','g')) not between 10 and 15 then raise exception 'Enter a valid phone number'; end if;
 if coalesce(p_email,'')<>'' and p_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' then raise exception 'Enter a valid email'; end if;
 select * into a from public.assets where id=p_asset for update;
 if not found or a.asset_type<>'container' then raise exception 'Choose a physical container'; end if;
 if exists(select 1 from public.tenancies where asset_id=p_asset and status in ('active','pending')) then raise exception 'This container already has a tenancy'; end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(trim(e.full_name)),0));
 select array_agg(id),count(*) into ids,matches from public.customers where
 lower(trim(full_name))=lower(trim(e.full_name))
 or (nullif(trim(p_email),'') is not null and lower(trim(email))=lower(trim(p_email)))
 or regexp_replace(coalesce(phone,''),'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g');
 if matches>1 then raise exception 'Several existing customers match. Review their records before continuing'; end if;
 if matches=1 then
 cid=ids[1];
 if not exists(select 1 from public.customers where id=cid and lower(trim(full_name))=lower(trim(e.full_name))) then raise exception 'These contact details belong to another customer. Review before continuing'; end if;
 else
 insert into public.customers(full_name,email,phone) values(e.full_name,nullif(trim(p_email),''),p_phone) returning id into cid;
 end if;
 insert into public.tenancies(asset_id,customer_id,start_date,monthly_rent_pence,vat_rate,payment_day,status,contract_status)
 values(p_asset,cid,p_start,round(p_total/(1+coalesce(a.vat_rate,0)/100))::integer,coalesce(a.vat_rate,0),extract(day from p_first)::integer,'pending','not_started') returning id into tid;
 update public.assets set status='occupied',public_listing=false where id=p_asset;
 update public.storage_enquiries set tenancy_id=tid,status='contacted',phone=p_phone,contact=coalesce(nullif(trim(p_email),''),p_phone) where id=p_enquiry;
 return tid;
end $$;
revoke all on function public.prepare_storage_enquiry(uuid,uuid,date,integer,date,text,text) from public,anon;
grant execute on function public.prepare_storage_enquiry(uuid,uuid,date,integer,date,text,text) to authenticated;
