-- Read-only assertions for the private hosted concurrent-publication fixture.
-- Two simultaneously submitted RPC transactions used backend PIDs 45830/45829.
-- They published the same previously uncommitted preview. One held its lock
-- for four seconds before COMMIT; both completed. A subsequent browser stage
-- correction reversed the two invented stage positions (not official results).
do $$
declare r uuid; s uuid;
begin
 select ra.id,ra.season_id into strict r,s
 from public.rc_races ra join public.rc_leagues le on le.id=ra.league_id
 where le.slug='setup-verification-20261015' and not le.is_public
   and ra.name='Private concurrency / invented stage test';
 if (select revision from public.rc_races where id=r)<>1
   or (select count(*) from public.rc_scores where race_id=r)<>21
   or (select count(*) from public.rc_imported_results where race_id=r)<>21
   or (select count(*) from public.rc_imports where race_id=r and status='committed' and payload is null)<>1
   or (select count(*) from public.rc_audit where entity_id=r and action='import.published')<>1
 then raise exception 'Concurrent publication duplicated or omitted data'; end if;
 if exists(select 1 from public.rc_driver_standings where season_id=s and starts<>1)
 then raise exception 'Duplicate championship start'; end if;
 if (select total_points from public.rc_scores where race_id=r and position=1)<>49
   or (select total_points from public.rc_scores where race_id=r and position=2)<>45
   or (select count(*) from public.rc_audit where entity_id=r and action='stages.corrected')<>1
 then raise exception 'Hosted stage correction not verified'; end if;
end $$;
select 'passed' as concurrency_and_hosted_stage_correction;
