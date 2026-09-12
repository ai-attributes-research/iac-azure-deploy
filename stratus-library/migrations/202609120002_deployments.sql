begin;
create table if not exists public.iac_deployments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  repo text not null, branch text not null, commit_sha text not null,
  resource text not null, engine text not null check (engine in ('bicep','terraform','arm','powershell','dsc','ansible')),
  inputs jsonb not null, runner_identity jsonb not null,
  status text not null default 'reviewed' check (status in ('reviewed','dispatching','queued','running','succeeded','failed','cancelled','unknown')),
  run_id bigint, run_url text, result text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  updated_at timestamptz not null default now()
);
create index if not exists iac_deployments_owner_created on public.iac_deployments(user_id,created_at desc);
alter table public.iac_deployments enable row level security;
revoke all on public.iac_deployments from anon, authenticated;
grant select on public.iac_deployments to authenticated;
grant all on public.iac_deployments to service_role;
drop policy if exists own_deployments_read on public.iac_deployments;
create policy own_deployments_read on public.iac_deployments for select to authenticated using ((select auth.uid())=user_id);
create or replace function public.claim_iac_deployment(p_id uuid, p_user uuid)
returns setof public.iac_deployments language sql security invoker set search_path=public
as $$
 update public.iac_deployments set status='dispatching',updated_at=now()
 where id=p_id and user_id=p_user and status='reviewed' and expires_at>now()
 returning *;
$$;
revoke all on function public.claim_iac_deployment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_iac_deployment(uuid,uuid) to service_role;
create table if not exists public.iac_autofill_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(), requests integer not null default 1
);
alter table public.iac_autofill_usage enable row level security;
revoke all on public.iac_autofill_usage from public,anon,authenticated;
grant all on public.iac_autofill_usage to service_role;
create or replace function public.claim_iac_autofill(p_user uuid)
returns boolean language sql security invoker set search_path=public as $$
 with claimed as (
  insert into public.iac_autofill_usage(user_id) values(p_user)
  on conflict(user_id) do update set
   requests=case when iac_autofill_usage.window_start < now()-interval '1 hour' then 1 else iac_autofill_usage.requests+1 end,
   window_start=case when iac_autofill_usage.window_start < now()-interval '1 hour' then now() else iac_autofill_usage.window_start end
  where iac_autofill_usage.window_start < now()-interval '1 hour' or iac_autofill_usage.requests<20
  returning user_id
 ) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_iac_autofill(uuid) from public,anon,authenticated;
grant execute on function public.claim_iac_autofill(uuid) to service_role;
commit;
