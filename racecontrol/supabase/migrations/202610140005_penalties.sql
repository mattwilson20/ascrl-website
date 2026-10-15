create function public.rc_penalty(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.rc_races; target public.rc_races; prior public.rc_penalties; entity uuid; state text;
begin
 if p->>'id' is not null then
  select * into strict prior from public.rc_penalties where id=(p->>'id')::uuid;
  select * into strict r from public.rc_races where id=prior.race_id;
 else
  select * into strict r from public.rc_races where id=(p->>'race_id')::uuid;
 end if;
 perform rc_private.require_role(r.league_id,array['commissioner','steward']);
 perform pg_advisory_xact_lock(hashtextextended(r.season_id::text,2));
 if prior.id is not null then
  select * into strict prior from public.rc_penalties where id=prior.id for update;
  state:=p->>'status';
  if state not in ('active','overturned') or length(trim(coalesce(p->>'reason','')))<10 then raise exception 'Confirm an active/overturned decision with a reason'; end if;
  if state='active' and prior.type='next_race' and not exists(select 1 from public.rc_scores where race_id=prior.target_race_id and driver_id=prior.driver_id) then
   raise exception 'Confirm a next-race deduction after the driver appears in the published target race';
  end if;
  update public.rc_penalties set status=state where id=prior.id;
  entity:=prior.id;
  perform rc_private.recalculate(prior.target_race_id);
  perform rc_private.audit(r.league_id,'penalty.'||state,entity,jsonb_build_object('before',to_jsonb(prior),'decision_reason',p->>'reason'));
 else
  if not exists(select 1 from public.rc_imported_results where race_id=r.id and revision=r.revision and driver_id=(p->>'driver_id')::uuid) then raise exception 'Driver must appear in the incident race'; end if;
  select * into strict target from public.rc_races where id=coalesce(nullif(p->>'target_race_id','')::uuid,r.id) and league_id=r.league_id and season_id=r.season_id;
  if p->>'type'='next_race' and target.starts_at<=r.starts_at then raise exception 'Choose the later race where this deduction takes effect'; end if;
  if p->>'type'<>'next_race' and target.id<>r.id then raise exception 'Only next-race penalties may target a different race'; end if;
  if p->>'type'='position' and ((p->>'value')::int<1 or (p->>'value')::int>(select count(*) from public.rc_scores where race_id=r.id)) then raise exception 'Finishing-position adjustment must fit the race grid'; end if;
  insert into public.rc_penalties(league_id,race_id,target_race_id,driver_id,type,value,reason,notes,issued_by)
  values(r.league_id,r.id,target.id,(p->>'driver_id')::uuid,p->>'type',coalesce((p->>'value')::int,0),p->>'reason',coalesce(p->>'notes',''),auth.uid()) returning id into entity;
  perform rc_private.audit(r.league_id,'penalty.proposed',entity,p);
 end if;
 return entity;
end $$;

create function public.rc_appeal(penalty uuid,statement text) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.rc_penalties; entity uuid;
begin
 select * into strict p from public.rc_penalties where id=penalty for update;
 if auth.uid() is null or not public.rc_owns_driver(p.driver_id) then raise exception 'Only the affected verified driver may appeal' using errcode='42501'; end if;
 if p.status<>'active' then raise exception 'Only active penalties can be appealed'; end if;
 insert into public.rc_appeals(league_id,penalty_id,submitted_by,statement) values(p.league_id,p.id,auth.uid(),statement) returning id into entity;
 update public.rc_penalties set status='appealed' where id=p.id;
 perform rc_private.audit(p.league_id,'penalty.appealed',p.id,jsonb_build_object('appeal_id',entity));
 return entity;
end $$;
create function public.rc_cancel_import(job uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare j public.rc_imports;
begin
 select * into strict j from public.rc_imports where id=job for update;
 perform rc_private.require_role(j.league_id,array['commissioner']);
 if j.status<>'preview' then raise exception 'Only uncommitted previews can be cancelled'; end if;
 update public.rc_imports set status='expired',payload=null where id=j.id;
 perform rc_private.audit(j.league_id,'import.cancelled',j.id);
 return j.id;
end $$;

-- Defense in depth: no application role can execute internal routines, mutate tables,
-- or invoke a newly added RPC by default. Explicit grants are part of each review.
revoke all on all functions in schema rc_private from public,anon,authenticated;
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'rc_%' loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
 end loop;
end $$;
grant execute on function public.rc_is_owner(),public.rc_has_role(uuid,text[]),public.rc_can_read(uuid),public.rc_owns_driver(uuid),public.rc_race_visible(uuid) to anon,authenticated;
grant execute on function public.rc_manage(text,jsonb),public.rc_my_driver(),public.rc_preview_import(uuid,text,jsonb,text),public.rc_publish_import(uuid,bigint[],jsonb,boolean),public.rc_update_stages(uuid,jsonb,text),public.rc_penalty(jsonb),public.rc_appeal(uuid,text),public.rc_cancel_import(uuid) to authenticated;
alter default privileges in schema rc_private revoke execute on functions from public;
