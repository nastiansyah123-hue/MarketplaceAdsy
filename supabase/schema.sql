-- Marketplace Adsy Team. Instalasi baru: jalankan satu file ini sekali.
-- Seluruh objek mp_* terpisah dari tabel Akuisisi dan CRM. Auth dibagi dalam project yang sama.
begin;
create table public.mp_profiles(id uuid primary key references auth.users(id),name text not null check(length(trim(name)) between 1 and 100),email text,role text not null default 'staff' check(role in ('admin','staff')),status text not null default 'pending' check(status in ('pending','active','inactive','rejected')),created_at timestamptz not null default now());
create table public.mp_shops(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 150),platform text not null check(platform in ('shopee','tiktok','lazada')),external_id text not null default '',tax_rate numeric(5,2) not null default 0 check(tax_rate between 0 and 100),fee_rate numeric(5,2) not null default 23 check(fee_rate between 0 and 100),active boolean not null default true,unique(platform,name));
create unique index mp_external_shop_id on mp_shops(platform,external_id) where external_id<>'';
create table public.mp_assignments(id uuid primary key default gen_random_uuid(),shop_id uuid not null references mp_shops(id),profile_id uuid not null references mp_profiles(id),active boolean not null default true,unique(shop_id,profile_id));
create or replace function public.mp_role() returns text language sql stable security definer set search_path=public as $$select role from mp_profiles where id=auth.uid() and status='active'$$;
create or replace function public.mp_can_access(p_shop uuid) returns boolean language sql stable security definer set search_path=public as $$select coalesce(mp_role()='admin' or (mp_role()='staff' and exists(select 1 from mp_assignments where shop_id=p_shop and profile_id=auth.uid() and active)),false)$$;
create table public.mp_products(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 100),unit text not null default 'box' check(length(unit) between 1 and 30),active boolean not null default true);
create unique index mp_product_name on mp_products(lower(trim(name)));
create table public.mp_mappings(id uuid primary key default gen_random_uuid(),shop_id uuid not null references mp_shops(id),kind text not null check(kind in ('sku','ad')),code text not null check(length(code) between 1 and 500),product_id uuid not null references mp_products(id),units integer not null default 1 check(units between 1 and 100000),unique(shop_id,kind,code));
create or replace function public.mp_normalize_mapping() returns trigger language plpgsql as $$begin new.code=upper(regexp_replace(trim(new.code),'\s+',' ','g'));return new;end$$;
create trigger mp_mapping_normalize before insert or update on mp_mappings for each row execute function mp_normalize_mapping();
create table public.mp_imports(id uuid primary key default gen_random_uuid(),shop_id uuid not null references mp_shops(id),actor_id uuid not null references mp_profiles(id),fingerprint text not null,file_names jsonb not null default '[]',snapshot_at timestamptz not null,date_from date,date_to date,order_count integer not null default 0,ad_count integer not null default 0,skipped_orders integer not null default 0,created_at timestamptz not null default now(),unique(shop_id,fingerprint));
create table public.mp_orders(id uuid primary key default gen_random_uuid(),shop_id uuid not null references mp_shops(id),order_id text not null check(length(order_id) between 1 and 100),line_id text not null check(length(line_id) between 1 and 1000),date date not null,status text not null check(status in ('valid','cancelled','unpaid','returned','unknown')),raw_status text not null,reason text not null default '',sku text not null,title text not null default '',quantity integer not null check(quantity between 1 and 1000000),amount numeric(18,2) not null check(amount>=0),returned_quantity integer not null default 0 check(returned_quantity>=0),refund numeric(18,2) not null default 0 check(refund>=0),source_channel text not null default '',snapshot_at timestamptz not null,import_id uuid not null references mp_imports(id),unique(shop_id,order_id,line_id));
create index mp_order_scope on mp_orders(shop_id,date,status);
create table public.mp_ads(id uuid primary key default gen_random_uuid(),shop_id uuid not null references mp_shops(id),date date not null,source text not null check(source in ('shopee_manual','shopee_auto','shopee_shop','shopee_rounding','manual','cpas')),external_key text not null,product_code text not null default '',product_id uuid references mp_products(id),label text not null default '',spend numeric(18,2) not null,tax_rate numeric(5,2) not null check(tax_rate between 0 and 100),conversions numeric(16,2) not null default 0 check(conversions>=0),ad_quantity numeric(16,2) not null default 0 check(ad_quantity>=0),ad_revenue numeric(18,2) not null default 0 check(ad_revenue>=0),snapshot_at timestamptz not null,actor_id uuid not null references mp_profiles(id),import_id uuid references mp_imports(id),unique(shop_id,date,source,external_key),check(spend>=0 or (source='shopee_rounding' and spend>=-100)));
create index mp_ads_scope on mp_ads(shop_id,date);
create table public.mp_daily(id uuid primary key default gen_random_uuid(),shop_id uuid not null references mp_shops(id),date date not null,affiliate numeric(18,2) not null default 0 check(affiliate>=0),platform_fee numeric(18,2) check(platform_fee>=0),notes text not null default '' check(length(notes)<=2000),actor_id uuid not null references mp_profiles(id),updated_at timestamptz not null default now(),unique(shop_id,date));
create table public.mp_cost_history(id uuid primary key default gen_random_uuid(),shop_id uuid not null references mp_shops(id),actor_id uuid not null references mp_profiles(id),record_type text not null,before_value jsonb,after_value jsonb,created_at timestamptz not null default now());
create or replace function public.mp_daily_guard() returns trigger language plpgsql security definer set search_path=public as $$begin
 if not mp_can_access(new.shop_id) then raise exception 'Akses toko ditolak.';end if;
 if TG_OP='UPDATE' and (new.shop_id<>old.shop_id or new.date<>old.date) then raise exception 'Identitas biaya tidak dapat diubah.';end if;
 new.actor_id=auth.uid();new.updated_at=now();
 insert into mp_cost_history(shop_id,actor_id,record_type,before_value,after_value) values(new.shop_id,auth.uid(),'daily',case when TG_OP='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));return new;
end$$;
create trigger mp_daily_prepare before insert or update on mp_daily for each row execute function mp_daily_guard();
create or replace function public.mp_import_data(p_shop uuid,p_fingerprint text,p_names jsonb,p_snapshot timestamptz,p_orders jsonb,p_ads jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare shop mp_shops; batch uuid; item jsonb; o text; d date; stale text[]='{}'; existing_at timestamptz; affected integer=0; skipped integer=0; adcount integer=0; incoming_ad_date date; ad_source text;
begin
 if not mp_can_access(p_shop) then raise exception 'Akses toko ditolak.';end if;
 select * into shop from mp_shops where id=p_shop and active;if not found then raise exception 'Toko tidak aktif.';end if;
 if p_snapshot is null or p_snapshot>now()+interval '1 day' then raise exception 'Waktu ekspor tidak valid.';end if;
 if p_fingerprint is null or p_fingerprint!~'^[a-f0-9]{64}$' then raise exception 'Identitas file tidak valid.';end if;
 if jsonb_typeof(p_orders) is distinct from 'array' or jsonb_typeof(p_ads) is distinct from 'array' or jsonb_typeof(p_names) is distinct from 'array' then raise exception 'Format impor tidak valid.';end if;
 if jsonb_array_length(p_orders) not between 1 and 20000 or jsonb_array_length(p_ads)>10000 or jsonb_array_length(p_names)>4 then raise exception 'Jumlah baris/file melebihi batas.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_shop::text,0));
 if exists(select 1 from mp_imports where shop_id=p_shop and fingerprint=p_fingerprint) then return jsonb_build_object('duplicate',true);end if;
 if shop.platform='shopee' then
  if jsonb_array_length(p_ads)=0 or jsonb_array_length(p_names)<>4 then raise exception 'Shopee memerlukan empat file termasuk iklan.';end if;
  select min((x->>'date')::date) into incoming_ad_date from jsonb_array_elements(p_ads) x;
  if exists(select 1 from jsonb_array_elements(p_ads) x where (x->>'date')::date<>incoming_ad_date) or exists(select 1 from jsonb_array_elements(p_orders) x where (x->>'date')::date<>incoming_ad_date) then raise exception 'Empat file Shopee harus memiliki periode harian yang sama.';end if;
 else if jsonb_array_length(p_ads)>0 then raise exception 'Biaya TikTok/Lazada diisi melalui input manual.';end if;end if;
 insert into mp_imports(shop_id,actor_id,fingerprint,file_names,snapshot_at,date_from,date_to) select p_shop,auth.uid(),p_fingerprint,p_names,p_snapshot,min((x->>'date')::date),max((x->>'date')::date) from jsonb_array_elements(p_orders) x returning id into batch;
 for o in select distinct value->>'order_id' from jsonb_array_elements(p_orders) loop
  select max(snapshot_at) into existing_at from mp_orders where shop_id=p_shop and order_id=o;
  if existing_at>p_snapshot then stale=array_append(stale,o);skipped=skipped+1;else delete from mp_orders where shop_id=p_shop and order_id=o;affected=affected+1;end if;
 end loop;
 for item in select value from jsonb_array_elements(p_orders) loop
  if item->>'order_id'=any(stale) then continue;end if;
  if jsonb_typeof(item->'quantity') is distinct from 'number' or (item->>'quantity')::numeric<>trunc((item->>'quantity')::numeric) or length(coalesce(item->>'sku','')) not between 1 and 500 then raise exception 'Jumlah atau SKU pesanan tidak valid.';end if;
  if (item->>'returned_quantity')::numeric<>trunc((item->>'returned_quantity')::numeric) then raise exception 'Jumlah retur tidak valid.';end if;
  insert into mp_orders(shop_id,order_id,line_id,date,status,raw_status,reason,sku,title,quantity,amount,returned_quantity,refund,source_channel,snapshot_at,import_id) values(p_shop,item->>'order_id',item->>'line_id',(item->>'date')::date,item->>'status',left(coalesce(item->>'raw_status',''),200),left(coalesce(item->>'reason',''),2000),item->>'sku',left(coalesce(item->>'title',''),1000),(item->>'quantity')::integer,(item->>'amount')::numeric,coalesce((item->>'returned_quantity')::integer,0),coalesce((item->>'refund')::numeric,0),left(coalesce(item->>'source_channel',''),100),p_snapshot,batch);
 end loop;
 if shop.platform='shopee' then
  select max(snapshot_at) into existing_at from mp_ads where shop_id=p_shop and date=incoming_ad_date and source like 'shopee_%';
  if existing_at is null or existing_at<=p_snapshot then
   delete from mp_ads where shop_id=p_shop and date=incoming_ad_date and source like 'shopee_%';
   for item in select value from jsonb_array_elements(p_ads) loop
    ad_source=item->>'source';if ad_source not in ('shopee_manual','shopee_auto','shopee_shop','shopee_rounding') then raise exception 'Sumber iklan tidak valid.';end if;
    insert into mp_ads(shop_id,date,source,external_key,product_code,label,spend,tax_rate,conversions,ad_quantity,ad_revenue,snapshot_at,actor_id,import_id) values(p_shop,(item->>'date')::date,ad_source,item->>'external_key',coalesce(item->>'product_code',''),left(coalesce(item->>'label',''),1000),(item->>'spend')::numeric,shop.tax_rate,coalesce((item->>'conversions')::numeric,0),coalesce((item->>'ad_quantity')::numeric,0),coalesce((item->>'ad_revenue')::numeric,0),p_snapshot,auth.uid(),batch);adcount=adcount+1;
   end loop;
  end if;
 end if;
 update mp_imports set order_count=affected,ad_count=adcount,skipped_orders=skipped where id=batch;
 return jsonb_build_object('duplicate',false,'orders',affected,'ads',adcount,'skipped',skipped);
end$$;
create or replace function public.mp_save_manual_ad(p_shop uuid,p_date date,p_source text,p_product uuid,p_spend numeric,p_tax numeric,p_note text) returns void language plpgsql security definer set search_path=public as $$
declare before_row jsonb;after_row jsonb;k text;shop mp_shops;
begin
 if not mp_can_access(p_shop) then raise exception 'Akses toko ditolak.';end if;
 select * into shop from mp_shops where id=p_shop and active;if not found then raise exception 'Toko tidak aktif.';end if;
 if p_source is null or p_source not in ('manual','cpas') or (shop.platform='shopee' and p_source='manual') then raise exception 'Iklan Shopee berasal dari CSV; gunakan CPAS untuk biaya eksternal.';end if;
 if p_spend is null or p_spend<0 or p_spend>1000000000000 or p_tax is null or p_tax not between 0 and 100 or p_date is null then raise exception 'Nominal/tanggal biaya tidak valid.';end if;
 if p_product is not null and not exists(select 1 from mp_products where id=p_product and active) then raise exception 'Produk tidak aktif.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_shop::text,0));k=coalesce(p_product::text,'store');
 select to_jsonb(a) into before_row from mp_ads a where shop_id=p_shop and date=p_date and source=p_source and external_key=k;
 insert into mp_ads(shop_id,date,source,external_key,product_id,label,spend,tax_rate,snapshot_at,actor_id) values(p_shop,p_date,p_source,k,p_product,left(coalesce(p_note,''),1000),p_spend,p_tax,now(),auth.uid()) on conflict(shop_id,date,source,external_key) do update set product_id=excluded.product_id,label=excluded.label,spend=excluded.spend,tax_rate=excluded.tax_rate,snapshot_at=excluded.snapshot_at,actor_id=excluded.actor_id returning to_jsonb(mp_ads.*) into after_row;
 insert into mp_cost_history(shop_id,actor_id,record_type,before_value,after_value) values(p_shop,auth.uid(),'manual_ad',before_row,after_row);
end$$;
create or replace function public.mp_manage_profile(p_id uuid,p_name text,p_role text,p_status text) returns void language plpgsql security definer set search_path=public as $$begin
 if mp_role() is distinct from 'admin' then raise exception 'Hanya admin.';end if;
 if p_id=auth.uid() then raise exception 'Gunakan admin lain untuk mengubah akses sendiri.';end if;
 if p_role not in ('admin','staff') or p_status not in ('active','pending','inactive','rejected') then raise exception 'Peran/status tidak valid.';end if;
 update mp_profiles set name=trim(p_name),role=p_role,status=p_status where id=p_id;if not found then raise exception 'Akun tidak ditemukan.';end if;
end$$;
create or replace function public.mp_set_assignments(p_shop uuid,p_profiles uuid[]) returns void language plpgsql security definer set search_path=public as $$
declare person uuid;
begin
 if mp_role() is distinct from 'admin' then raise exception 'Hanya admin.';end if;
 if not exists(select 1 from mp_shops where id=p_shop) then raise exception 'Toko tidak ditemukan.';end if;
 if p_profiles is null then raise exception 'Daftar anggota tidak valid.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_shop::text,0));
 foreach person in array p_profiles loop
  if not exists(select 1 from mp_profiles where id=person and role='staff' and status='active') then raise exception 'Anggota harus aktif.';end if;
 end loop;
 update mp_assignments set active=false where shop_id=p_shop;
 foreach person in array p_profiles loop
  insert into mp_assignments(shop_id,profile_id,active) values(p_shop,person,true) on conflict(shop_id,profile_id) do update set active=true;
 end loop;
end$$;
create or replace function public.mp_signup() returns trigger language plpgsql security definer set search_path=public as $$begin
 if new.raw_user_meta_data->>'app' is distinct from 'marketplace_adsy' then return new;end if;
 insert into mp_profiles(id,name,email) values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Anggota Marketplace'),100),new.email);return new;
end$$;
create trigger mp_auth_signup after insert on auth.users for each row execute function mp_signup();
create or replace function public.mp_request_access(p_name text) returns void language plpgsql security definer set search_path=public as $$begin
 if auth.uid() is null or length(trim(p_name)) not between 1 and 100 then raise exception 'Masuk dan isi nama.';end if;
 insert into mp_profiles(id,name,email) select auth.uid(),trim(p_name),email from auth.users where id=auth.uid() on conflict(id) do nothing;
end$$;
alter table mp_profiles enable row level security;alter table mp_shops enable row level security;alter table mp_assignments enable row level security;alter table mp_products enable row level security;alter table mp_mappings enable row level security;alter table mp_orders enable row level security;alter table mp_ads enable row level security;alter table mp_daily enable row level security;alter table mp_imports enable row level security;alter table mp_cost_history enable row level security;
create policy mp_profile_read on mp_profiles for select to authenticated using(id=auth.uid() or mp_role()='admin');
create policy mp_shop_read on mp_shops for select to authenticated using(mp_can_access(id));
create policy mp_shop_admin on mp_shops for all to authenticated using(mp_role()='admin') with check(mp_role()='admin');
create policy mp_assignment_read on mp_assignments for select to authenticated using(mp_role()='admin' or (mp_role() is not null and profile_id=auth.uid()));
create policy mp_assignment_admin on mp_assignments for all to authenticated using(mp_role()='admin') with check(mp_role()='admin');
create policy mp_product_read on mp_products for select to authenticated using(mp_role() is not null);
create policy mp_product_admin on mp_products for all to authenticated using(mp_role()='admin') with check(mp_role()='admin');
create policy mp_mapping_read on mp_mappings for select to authenticated using(mp_can_access(shop_id));
create policy mp_mapping_admin on mp_mappings for all to authenticated using(mp_role()='admin') with check(mp_role()='admin');
create policy mp_order_read on mp_orders for select to authenticated using(mp_can_access(shop_id));
create policy mp_ads_read on mp_ads for select to authenticated using(mp_can_access(shop_id));
create policy mp_daily_read on mp_daily for select to authenticated using(mp_can_access(shop_id));
create policy mp_daily_write on mp_daily for all to authenticated using(mp_can_access(shop_id)) with check(mp_can_access(shop_id));
create policy mp_import_read on mp_imports for select to authenticated using(mp_can_access(shop_id));
create policy mp_history_read on mp_cost_history for select to authenticated using(mp_can_access(shop_id));
grant select on mp_profiles,mp_shops,mp_assignments,mp_products,mp_mappings,mp_orders,mp_ads,mp_daily,mp_imports,mp_cost_history to authenticated;
grant insert,update on mp_shops,mp_assignments,mp_products,mp_mappings,mp_daily to authenticated;
revoke all on mp_profiles,mp_shops,mp_assignments,mp_products,mp_mappings,mp_orders,mp_ads,mp_daily,mp_imports,mp_cost_history from anon;
revoke insert,update,delete on mp_profiles,mp_orders,mp_ads,mp_imports,mp_cost_history from authenticated;
revoke delete on mp_shops,mp_assignments,mp_products,mp_mappings,mp_daily from authenticated;
revoke all on function mp_role(),mp_can_access(uuid),mp_import_data(uuid,text,jsonb,timestamptz,jsonb,jsonb),mp_save_manual_ad(uuid,date,text,uuid,numeric,numeric,text),mp_manage_profile(uuid,text,text,text),mp_request_access(text),mp_set_assignments(uuid,uuid[]),mp_signup(),mp_daily_guard(),mp_normalize_mapping() from public;
grant execute on function mp_role(),mp_can_access(uuid),mp_import_data(uuid,text,jsonb,timestamptz,jsonb,jsonb),mp_save_manual_ad(uuid,date,text,uuid,numeric,numeric,text),mp_manage_profile(uuid,text,text,text),mp_request_access(text),mp_set_assignments(uuid,uuid[]) to authenticated;
commit;
