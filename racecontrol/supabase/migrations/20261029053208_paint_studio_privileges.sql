-- Supabase project defaults may include non-DML privileges. Start from no grants.
revoke all on public.rc_paint_access,public.rc_paint_sessions,public.rc_paint_backups from public,anon,authenticated;
grant select on public.rc_paint_access to authenticated;
grant select,insert,update on public.rc_paint_sessions to authenticated;
grant select(id,user_id,profile,title,created_at) on public.rc_paint_backups to authenticated;
revoke all on all tables in schema rc_paint_private from public,anon,authenticated;
revoke all on schema rc_paint_private from public,anon,authenticated;
