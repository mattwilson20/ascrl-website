-- Apply only to a dedicated Supabase project. No existing ASCRL website tables are used.
create schema if not exists rc_private;
revoke all on schema rc_private from public;

create table public.rc_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);
create table public.rc_platform_owners (user_id uuid primary key references auth.users(id));
create table public.rc_leagues (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 2 and 100),
  slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '' check(length(description)<=2000),
  is_public boolean not null default true, created_at timestamptz not null default now()
);
create table public.rc_memberships (
  league_id uuid not null references public.rc_leagues(id), user_id uuid not null references auth.users(id),
  role text not null check(role in ('commissioner','steward','team_owner','driver')),
  status text not null default 'pending' check(status in ('pending','active','revoked')),
  primary key(league_id,user_id)
);
create table public.rc_drivers (
  id uuid primary key default gen_random_uuid(), racing_name text not null check(length(racing_name) between 1 and 100),
  car_number text check(length(car_number)<=12), created_at timestamptz not null default now()
);
create table public.rc_driver_identities (
  driver_id uuid primary key references public.rc_drivers(id), customer_id bigint not null unique check(customer_id>0),
  account_id uuid unique references auth.users(id)
);
create table public.rc_series (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.rc_leagues(id),
  name text not null check(length(name) between 2 and 100), unique(id,league_id)
);
create table public.rc_seasons (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.rc_leagues(id),
  series_id uuid not null, name text not null check(length(name) between 2 and 100),
  status text not null default 'active' check(status in ('active','archived')),
  active_rule_id uuid, drop_weeks integer not null default 0 check(drop_weeks between 0 and 50),
  tiebreakers text[] not null default array['wins','top5','top10','average_finish','latest_finish'],
  unique(id,league_id), foreign key(series_id,league_id) references public.rc_series(id,league_id)
);
create table public.rc_scoring_rules (
  id uuid primary key default gen_random_uuid(), league_id uuid not null, season_id uuid not null,
  version integer not null check(version>0), name text not null check(length(name) between 2 and 100),
  config jsonb not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(id,season_id), unique(season_id,version),
  foreign key(season_id,league_id) references public.rc_seasons(id,league_id)
);
alter table public.rc_seasons add foreign key(active_rule_id,id) references public.rc_scoring_rules(id,season_id);
create table public.rc_races (
  id uuid primary key default gen_random_uuid(), league_id uuid not null, season_id uuid not null,
  name text not null check(length(name) between 2 and 120), track text not null check(length(track) between 2 and 200),
  starts_at timestamptz not null, stage_count integer not null default 0 check(stage_count between 0 and 10),
  status text not null default 'scheduled' check(status in ('scheduled','published')),
  revision integer not null default 0, rule_id uuid, subsession_id bigint,
  unique(id,league_id), unique(id,season_id), unique(season_id,subsession_id),
  foreign key(season_id,league_id) references public.rc_seasons(id,league_id),
  foreign key(rule_id,season_id) references public.rc_scoring_rules(id,season_id)
);
create table public.rc_teams (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.rc_leagues(id),
  name text not null check(length(name) between 2 and 100), owner_id uuid references auth.users(id), unique(id,league_id)
);
create table public.rc_team_memberships (
  id uuid primary key default gen_random_uuid(), league_id uuid not null, team_id uuid not null,
  driver_id uuid not null references public.rc_drivers(id), valid_from timestamptz not null, valid_until timestamptz,
  check(valid_until is null or valid_until>valid_from), foreign key(team_id,league_id) references public.rc_teams(id,league_id)
);
create table public.rc_registrations (
  season_id uuid not null, league_id uuid not null, driver_id uuid not null references public.rc_drivers(id),
  eligible boolean not null default false, primary key(season_id,driver_id),
  foreign key(season_id,league_id) references public.rc_seasons(id,league_id)
);
create table public.rc_imports (
  id uuid primary key default gen_random_uuid(), league_id uuid not null, season_id uuid not null, race_id uuid not null,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  file_hash text not null check(file_hash ~ '^[a-f0-9]{64}$'), adapter text not null,
  subsession_id bigint not null check(subsession_id>0), source_session_id bigint, source_race_session integer,
  source_date timestamptz not null, source_track text not null,
  payload jsonb, warnings jsonb not null default '[]', expected_revision integer not null,
  status text not null default 'preview' check(status in ('preview','committed','expired')),
  correction_reason text, committed_at timestamptz,
  foreign key(race_id,season_id) references public.rc_races(id,season_id),
  foreign key(season_id,league_id) references public.rc_seasons(id,league_id)
);
create table public.rc_imported_results (
  race_id uuid not null, revision integer not null, league_id uuid not null, driver_id uuid not null references public.rc_drivers(id),
  import_id uuid not null references public.rc_imports(id), team_id uuid, rule_id uuid not null references public.rc_scoring_rules(id),
  original jsonb not null, eligible boolean not null,
  primary key(race_id,revision,driver_id), foreign key(race_id,league_id) references public.rc_races(id,league_id),
  foreign key(team_id,league_id) references public.rc_teams(id,league_id)
);
create table public.rc_stages (
  race_id uuid not null, revision integer not null, league_id uuid not null, stage integer not null check(stage between 1 and 10),
  driver_id uuid not null, position integer not null check(position between 1 and 500),
  primary key(race_id,revision,stage,driver_id), unique(race_id,revision,stage,position),
  foreign key(race_id,revision,driver_id) references public.rc_imported_results(race_id,revision,driver_id),
  foreign key(race_id,league_id) references public.rc_races(id,league_id)
);
create table public.rc_penalties (
  id uuid primary key default gen_random_uuid(), league_id uuid not null, race_id uuid not null, target_race_id uuid not null,
  driver_id uuid not null references public.rc_drivers(id),
  type text not null check(type in ('points','position','disqualification','warning','suspension','next_race')),
  value integer not null default 0 check(value between 0 and 10000), reason text not null check(length(reason) between 10 and 2000),
  notes text not null default '' check(length(notes)<=5000),
  status text not null default 'pending' check(status in ('pending','active','overturned','appealed')),
  issued_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  foreign key(race_id,league_id) references public.rc_races(id,league_id),
  foreign key(target_race_id,league_id) references public.rc_races(id,league_id)
);
create table public.rc_appeals (
  id uuid primary key default gen_random_uuid(), league_id uuid not null references public.rc_leagues(id),
  penalty_id uuid not null unique references public.rc_penalties(id), submitted_by uuid not null references auth.users(id),
  statement text not null check(length(statement) between 10 and 5000), created_at timestamptz not null default now()
);
create table public.rc_scores (
  race_id uuid not null, league_id uuid not null, season_id uuid not null, driver_id uuid not null, revision integer not null,
  team_id uuid, position integer not null, class_position integer, car_number text,
  start_position integer, laps integer, incidents integer, dq boolean not null,
  finish_points numeric(12,3) not null, stage_points numeric(12,3) not null, bonus_points numeric(12,3) not null,
  penalty_points numeric(12,3) not null, total_points numeric(12,3) not null, team_count integer not null,
  eligible boolean not null, primary key(race_id,driver_id),
  foreign key(race_id,revision,driver_id) references public.rc_imported_results(race_id,revision,driver_id),
  foreign key(race_id,league_id) references public.rc_races(id,league_id),
  foreign key(season_id,league_id) references public.rc_seasons(id,league_id),
  foreign key(team_id,league_id) references public.rc_teams(id,league_id)
);
create table public.rc_audit (
  id bigint generated always as identity primary key, league_id uuid references public.rc_leagues(id),
  actor_id uuid references auth.users(id), action text not null, entity_id uuid, details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index rc_memberships_user on public.rc_memberships(user_id,league_id,status);
create index rc_series_league on public.rc_series(league_id);
create index rc_seasons_series on public.rc_seasons(series_id);
create index rc_races_season on public.rc_races(season_id,starts_at);
create index rc_results_driver on public.rc_imported_results(driver_id);
create index rc_scores_season on public.rc_scores(season_id,driver_id);
create index rc_teams_roster on public.rc_team_memberships(league_id,driver_id,valid_from,valid_until);
create index rc_penalties_target on public.rc_penalties(target_race_id,driver_id,status);
create index rc_imports_actor on public.rc_imports(created_by,created_at);
create unique index rc_imports_hash on public.rc_imports(season_id,file_hash) where status<>'expired';
create index rc_audit_league on public.rc_audit(league_id,created_at desc);

create function public.rc_is_owner() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rc_platform_owners where user_id=auth.uid());
$$;
create function public.rc_has_role(l uuid, roles text[]) returns boolean language sql stable security definer set search_path='' as $$
 select public.rc_is_owner() or exists(select 1 from public.rc_memberships where league_id=l and user_id=auth.uid() and status='active' and role=any(roles));
$$;
create function public.rc_can_read(l uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rc_leagues where id=l and is_public) or public.rc_has_role(l,array['commissioner','steward','team_owner','driver']);
$$;
create function public.rc_owns_driver(d uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rc_driver_identities where driver_id=d and account_id=auth.uid());
$$;
create function public.rc_race_visible(r uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rc_races where id=r and ((status='published' and public.rc_can_read(league_id)) or public.rc_has_role(league_id,array['commissioner','steward'])));
$$;
create function rc_private.require_role(l uuid,roles text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.rc_has_role(l,roles) then raise exception 'Not authorized for this league' using errcode='42501'; end if;
end $$;
create function rc_private.audit(l uuid,a text,e uuid,d jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into public.rc_audit(league_id,actor_id,action,entity_id,details) values(l,auth.uid(),a,e,d);
$$;
create function rc_private.immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'This history is immutable'; end $$;
create trigger immutable_audit before update or delete on public.rc_audit for each row execute function rc_private.immutable();
create trigger immutable_results before update or delete on public.rc_imported_results for each row execute function rc_private.immutable();
create trigger immutable_rules before update or delete on public.rc_scoring_rules for each row execute function rc_private.immutable();

-- SELECT policies are intentionally separate from writes. All mutations use checked RPCs.
do $$ declare t text; begin
 foreach t in array array['profiles','platform_owners','leagues','memberships','drivers','driver_identities','series','seasons','scoring_rules','races','teams','team_memberships','registrations','imports','imported_results','stages','penalties','appeals','scores','audit'] loop
  execute format('alter table public.rc_%I enable row level security',t);
  execute format('revoke all on public.rc_%I from anon, authenticated',t);
  execute format('grant select on public.rc_%I to anon, authenticated',t);
 end loop;
end $$;
create policy profiles_self on public.rc_profiles for select using(id=auth.uid() or public.rc_is_owner());
create policy owners_self on public.rc_platform_owners for select using(user_id=auth.uid());
create policy leagues_read on public.rc_leagues for select using(public.rc_can_read(id));
create policy memberships_read on public.rc_memberships for select using(user_id=auth.uid() or public.rc_has_role(league_id,array['commissioner']));
create policy drivers_read on public.rc_drivers for select using(public.rc_owns_driver(id) or exists(select 1 from public.rc_scores where driver_id=id) or exists(select 1 from public.rc_memberships where user_id=auth.uid() and status='active' and role in ('commissioner','steward')) or public.rc_is_owner());
create policy identities_read on public.rc_driver_identities for select using(account_id=auth.uid() or public.rc_is_owner() or exists(select 1 from public.rc_memberships where user_id=auth.uid() and role='commissioner' and status='active'));
do $$ declare t text; begin
 foreach t in array array['series','seasons','scoring_rules','races','teams','team_memberships','registrations'] loop
  execute format('create policy read_scope on public.rc_%I for select using(public.rc_can_read(league_id))',t);
 end loop;
end $$;
create policy imports_read on public.rc_imports for select using(public.rc_has_role(league_id,array['commissioner']));
create policy originals_read on public.rc_imported_results for select using(public.rc_has_role(league_id,array['commissioner','steward']));
create policy stages_read on public.rc_stages for select using(public.rc_race_visible(race_id));
create policy scores_read on public.rc_scores for select using(public.rc_race_visible(race_id));
create policy penalties_read on public.rc_penalties for select using(public.rc_has_role(league_id,array['commissioner','steward']) or public.rc_owns_driver(driver_id));
create policy appeals_read on public.rc_appeals for select using(submitted_by=auth.uid() or public.rc_has_role(league_id,array['commissioner','steward']));
create policy audit_read on public.rc_audit for select using(public.rc_has_role(league_id,array['commissioner','steward']));
