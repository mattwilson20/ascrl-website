create function rc_private.validate_grid(grid jsonb) returns void language plpgsql set search_path='' as $$
declare e jsonb; n int; k text;
begin
 if jsonb_typeof(grid)<>'array' then raise exception 'Driver grid must be an array'; end if;
 n:=jsonb_array_length(grid);
 if n not between 1 and 500 then raise exception 'Driver count must be between 1 and 500'; end if;
 for e in select value from jsonb_array_elements(grid) loop
  if not(e ?& array['customerId','name','position']) or e->>'customerId' is null or e->>'name' is null or e->>'position' is null or (e->>'customerId')::bigint<=0 or length(e->>'name') not between 1 and 100 or (e->>'position')::int not between 1 and n then raise exception 'Incomplete or invalid driver result'; end if;
  foreach k in array array['laps','lapsLed','incidents','classId','carId'] loop
   if e->>k is not null and (e->>k)::bigint not between 0 and 10000000 then raise exception 'Invalid race statistic: %',k; end if;
  end loop;
  foreach k in array array['startPosition','classPosition'] loop
   if e->>k is not null and (e->>k)::int not between 1 and n then raise exception 'Invalid position: %',k; end if;
  end loop;
  if length(coalesce(e->>'carNumber',''))>12 or (e->>'fastestLapTicks')::numeric<=0 then raise exception 'Invalid car number or lap time'; end if;
 end loop;
 if (select count(distinct value->>'customerId') from jsonb_array_elements(grid))<>n or (select count(distinct (value->>'position')::int) from jsonb_array_elements(grid))<>n then raise exception 'Duplicate customer IDs or finishing positions'; end if;
end $$;

create function public.rc_preview_import(race uuid,hash text,normalized jsonb,correction text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.rc_races; id uuid;
begin
 select * into strict r from public.rc_races where rc_races.id=race;
 perform rc_private.require_role(r.league_id,array['commissioner']);
 if exists(select 1 from public.rc_seasons where rc_seasons.id=r.season_id and status='archived') then raise exception 'Season is archived'; end if;
 if (select count(*) from public.rc_imports where created_by=auth.uid() and created_at>now()-interval '1 hour')>=30 then raise exception 'Import rate limit reached. Please try again later.'; end if;
 perform rc_private.validate_grid(normalized->'drivers');
 update public.rc_imports set payload=null,status='expired' where created_by=auth.uid() and status='preview' and expires_at<now();
 if exists(select 1 from public.rc_imports where season_id=r.season_id and file_hash=hash and status<>'expired') then raise exception 'This file has already been submitted for this season. Open its existing import instead.'; end if;
 if normalized->>'adapter'<>'iracing-event-result-v1' then raise exception 'Unsupported adapter'; end if;
 if r.revision>0 and length(trim(coalesce(correction,'')))<10 then raise exception 'Published races require an explicit correction reason'; end if;
 if exists(select 1 from public.rc_races where season_id=r.season_id and subsession_id=(normalized->>'subsessionId')::bigint and rc_races.id<>race) then raise exception 'This subsession is already assigned to another race in this season'; end if;
 -- Raw uploaded files are never stored.
 insert into public.rc_imports(league_id,season_id,race_id,created_by,file_hash,adapter,subsession_id,source_session_id,source_race_session,source_date,source_track,payload,warnings,expected_revision,correction_reason)
 values(r.league_id,r.season_id,r.id,auth.uid(),hash,normalized->>'adapter',(normalized->>'subsessionId')::bigint,(normalized->>'sessionId')::bigint,(normalized->>'raceSession')::int,(normalized->>'date')::timestamptz,normalized->>'track',normalized->'drivers',coalesce(normalized->'warnings','[]'),r.revision,nullif(trim(correction),'')) returning rc_imports.id into id;
 perform rc_private.audit(r.league_id,'import.preview',id,jsonb_build_object('race_id',race,'hash',hash,'drivers',jsonb_array_length(normalized->'drivers')));
 return id;
exception when unique_violation then raise exception 'This file has already been submitted for this season. Open its existing import instead.';
end $$;

create function rc_private.save_stages(r public.rc_races,orders jsonb) returns void language plpgsql security definer set search_path='' as $$
declare st jsonb; cid jsonb; n int:=0; pos int; drv uuid; needed int;
begin
 if jsonb_typeof(orders)<>'array' or jsonb_array_length(orders)<>r.stage_count then raise exception 'Enter the finishing order for every configured stage'; end if;
 select least(jsonb_array_length(config->'stage'),(select count(*)::int from public.rc_imported_results where race_id=r.id and revision=r.revision)) into needed from public.rc_scoring_rules where id=r.rule_id;
 delete from public.rc_stages where race_id=r.id and revision=r.revision;
 for st in select value from jsonb_array_elements(orders) loop
  n:=n+1;pos:=0;
  if jsonb_typeof(st)<>'array' or jsonb_array_length(st)<needed then raise exception 'Each stage needs at least % scoring positions',needed; end if;
  for cid in select value from jsonb_array_elements(st) loop
   pos:=pos+1;
   select driver_id into strict drv from public.rc_driver_identities where customer_id=(cid::text)::bigint;
   insert into public.rc_stages(race_id,revision,league_id,stage,driver_id,position) values(r.id,r.revision,r.league_id,n,drv,pos);
  end loop;
 end loop;
end $$;

create function public.rc_publish_import(job uuid,create_customers bigint[],stage_orders jsonb,confirm_metadata boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare j public.rc_imports; r public.rc_races; s public.rc_seasons; e jsonb; drv uuid; team uuid; eligible boolean; c jsonb;
begin
 select * into strict j from public.rc_imports where id=job;
 perform rc_private.require_role(j.league_id,array['commissioner']);
 -- Season lock serializes duplicate subsessions, rule selection, and simultaneous corrections.
 perform pg_advisory_xact_lock(hashtextextended(j.season_id::text,2));
 select * into strict j from public.rc_imports where id=job for update;
 if j.status='committed' then return j.race_id; end if;
 if j.status<>'preview' or j.expires_at<now() then raise exception 'Preview expired. Re-upload with a new preview after cleanup.'; end if;
 select * into strict r from public.rc_races where id=j.race_id for update;
 select * into strict s from public.rc_seasons where id=r.season_id for update;
 if s.status='archived' then raise exception 'Season is archived'; end if;
 if r.revision<>j.expected_revision then raise exception 'Race changed after this preview. Start a new correction.'; end if;
 if confirm_metadata is distinct from true then raise exception 'Confirm the source track, date, and selected race'; end if;
 if r.revision>0 and length(coalesce(j.correction_reason,''))<10 then raise exception 'Correction reason required'; end if;
 if exists(select 1 from public.rc_races where season_id=r.season_id and subsession_id=j.subsession_id and id<>r.id) then raise exception 'Duplicate subsession'; end if;
 r.rule_id:=coalesce(r.rule_id,s.active_rule_id);
 if r.rule_id is null then raise exception 'Configure scoring rules first'; end if;
 select config into strict c from public.rc_scoring_rules where id=r.rule_id;
 perform rc_private.validate_grid(j.payload);
 if exists(select 1 from public.rc_penalties p join public.rc_driver_identities d on d.driver_id=p.driver_id
  where p.target_race_id=r.id and p.status in ('active','appealed')
  and not exists(select 1 from jsonb_array_elements(j.payload) incoming where (incoming->>'customerId')::bigint=d.customer_id)) then
  raise exception 'A correction cannot omit a driver with an active penalty. Resolve the penalty first.';
 end if;
 r.revision:=r.revision+1;
 for e in select value from jsonb_array_elements(j.payload) order by (value->>'customerId')::bigint loop
  select driver_id into drv from public.rc_driver_identities where customer_id=(e->>'customerId')::bigint;
  if drv is null then
   if not((e->>'customerId')::bigint=any(coalesce(create_customers,'{}'::bigint[]))) then raise exception 'Unmatched driver % requires explicit creation approval',e->>'name'; end if;
   -- Serialize the same new driver imported concurrently by different leagues.
   perform pg_advisory_xact_lock((e->>'customerId')::bigint);
   select driver_id into drv from public.rc_driver_identities where customer_id=(e->>'customerId')::bigint;
   if drv is null then
    insert into public.rc_drivers(racing_name,car_number) values(e->>'name',e->>'carNumber') returning id into drv;
    insert into public.rc_driver_identities(driver_id,customer_id) values(drv,(e->>'customerId')::bigint);
   end if;
  end if;
  team:=null;
  select team_id into team from public.rc_team_memberships where league_id=r.league_id and driver_id=drv and valid_from<=j.source_date and (valid_until is null or valid_until>j.source_date);
  -- Corrections preserve the original team snapshot, even after a roster change.
  if j.expected_revision>0 then
   select team_id into team from public.rc_imported_results where race_id=r.id and revision=j.expected_revision and driver_id=drv;
  end if;
  eligible:=c->>'eligibility'='all' or exists(select 1 from public.rc_registrations where season_id=r.season_id and driver_id=drv and rc_registrations.eligible);
  insert into public.rc_imported_results(race_id,revision,league_id,driver_id,import_id,team_id,rule_id,original,eligible) values(r.id,r.revision,r.league_id,drv,j.id,team,r.rule_id,e,eligible);
 end loop;
 update public.rc_races set revision=r.revision,rule_id=r.rule_id,subsession_id=j.subsession_id,starts_at=j.source_date,track=j.source_track where id=r.id;
 perform rc_private.save_stages(r,stage_orders);
 perform rc_private.recalculate(r.id);
 update public.rc_races set status='published' where id=r.id;
 update public.rc_imports set status='committed',payload=null,committed_at=now() where id=j.id;
 perform rc_private.audit(r.league_id,case when j.expected_revision>0 then 'import.corrected' else 'import.published' end,r.id,jsonb_build_object('import_id',j.id,'revision',r.revision,'rule_id',r.rule_id,'reason',j.correction_reason,'stage_orders',stage_orders));
 return r.id;
end $$;

create function public.rc_update_stages(race uuid,orders jsonb,reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.rc_races; old jsonb;
begin
 select * into strict r from public.rc_races where id=race for update;
 perform rc_private.require_role(r.league_id,array['commissioner']);
 if r.status<>'published' or length(trim(reason))<10 then raise exception 'Published race and correction reason required'; end if;
 select jsonb_agg(to_jsonb(st)) into old from public.rc_stages st where race_id=r.id and revision=r.revision;
 perform rc_private.save_stages(r,orders);
 perform rc_private.recalculate(r.id);
 perform rc_private.audit(r.league_id,'stages.corrected',r.id,jsonb_build_object('before',old,'orders',orders,'reason',reason));
 return r.id;
end $$;
