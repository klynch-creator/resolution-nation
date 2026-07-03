-- Class leaderboard: lets a student see aggregate stats (stars earned, lessons
-- completed) for classmates in their CLASS pods, for the student-facing class
-- page. SECURITY DEFINER because RLS (correctly) blocks students from reading
-- each other's star_transactions and lessons.
--
-- Privacy (FERPA-conscious, decided 2026-07-03): exposes ONLY names, avatars,
-- and aggregate counts. NO goals, NO adaptive levels, NO lesson content, NO
-- grades. Scoped to pods of type 'class' that the CALLER belongs to.

create or replace function public.get_class_leaderboard()
returns table (
  pod_id uuid,
  pod_name text,
  student_id uuid,
  full_name text,
  avatar_url text,
  stars_all bigint,
  stars_week bigint,
  lessons_all bigint,
  lessons_week bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with my_pods as (
    select pm.pod_id
    from pod_members pm
    join pods pd on pd.id = pm.pod_id and pd.type = 'class'
    where pm.user_id = auth.uid()
  ),
  members as (
    select distinct pm.pod_id, pm.user_id
    from pod_members pm
    join my_pods mp on mp.pod_id = pm.pod_id
    join profiles pr on pr.id = pm.user_id and pr.role = 'student'
  )
  select
    m.pod_id,
    pd.name as pod_name,
    m.user_id as student_id,
    pr.full_name,
    pr.avatar_url,
    coalesce((select sum(st.amount) from star_transactions st
      where st.user_id = m.user_id and st.type in ('earned','bonus')), 0)::bigint as stars_all,
    coalesce((select sum(st.amount) from star_transactions st
      where st.user_id = m.user_id and st.type in ('earned','bonus')
        and st.created_at >= date_trunc('week', now())), 0)::bigint as stars_week,
    (select count(*) from lessons l
      where l.student_id = m.user_id and l.status = 'completed')::bigint as lessons_all,
    (select count(*) from lessons l
      where l.student_id = m.user_id and l.status = 'completed'
        and l.completed_at >= date_trunc('week', now()))::bigint as lessons_week
  from members m
  join pods pd on pd.id = m.pod_id
  join profiles pr on pr.id = m.user_id;
$$;

revoke all on function public.get_class_leaderboard() from public;
grant execute on function public.get_class_leaderboard() to authenticated;
