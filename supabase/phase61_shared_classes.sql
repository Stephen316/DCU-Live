-- DCU Live — phase 61: a student can put a class on the timetable of everyone on their course.
--
-- RUN ORDER: phase60_grouping_targets.sql → THIS FILE. Safe to run more than once. Run it
-- BEFORE the app that shares classes goes out: that app asks `timetable_changes` for the new
-- `shared` column, and falls back to its old question while the column isn't there.
--
-- Why: Add class in Edit timetable puts a class on one student's timetable at a time of their
-- own — a lecture moved by email, a make-up lab. Most of those are news for the whole course,
-- so "For everyone on your course" is on by default and the class is saved here, as an `add`
-- change like the console's, which every phone on the course already downloads.
--
-- Nobody approves it first. Classmates who find it isn't on say so on the class's page, with
-- the same reports a cancellation uses (`cancellation_reports`, keyed by the class and its
-- start), and once enough of them do the app greys it out, as it does a cancelled class. An
-- admin can delete one from the console like any other change.
--
--   1. timetable_changes.shared: true for a class a student shared, false for the console's.
--   2. private.shared_class_authors: who shared each one, kept off the table everyone reads,
--      so a classmate never learns who added a class. Only the functions below read it.
--   3. share_class(p_class): saves one for a course, for one date or several. Signed in, not
--      banned, an existing course, at most 10 a day.
--   4. withdraw_shared_class(p_id): the student who shared one takes it down for everyone.

alter table public.timetable_changes add column if not exists shared boolean not null default false;

create schema if not exists private;

create table if not exists private.shared_class_authors (
  change_id  uuid primary key references public.timetable_changes (id) on delete cascade,
  author_id  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists shared_class_authors_author on private.shared_class_authors (author_id, created_at);

alter table private.shared_class_authors enable row level security;
revoke all on table private.shared_class_authors from public, anon, authenticated;

-- ---------------------------------------------------------------------------

create or replace function public.share_class(p_class jsonb) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  new_id uuid;
  d text[];
  course text := upper(nullif(trim(p_class ->> 'course_key'), ''));
  module text := upper(nullif(trim(p_class ->> 'module'), ''));
  title text := nullif(btrim(p_class ->> 'title'), '');
  kind text := upper(nullif(trim(p_class ->> 'kind'), ''));
begin
  if me is null then raise exception 'sign in to share a class'; end if;
  if public.is_banned() then raise exception 'not allowed'; end if;

  -- A course the console knows: one with a class list, or one of a class list's programmes.
  -- Any other DCU programme is a course of its own, saved under its code (CASE3), as the app's
  -- TimetableAudience.forProgramme has it.
  if course is null or not (
    exists (select 1 from public.rosters r where r.course_key = course)
    or exists (select 1 from public.course_programmes p where p.course_key = course)
    or course ~ '^[A-Z]{2,6}[0-9]$'
  ) then
    raise exception 'unknown course';
  end if;
  if module is null or module !~ '^[A-Z]{2,6}[0-9]{3,5}$' then raise exception 'that is not a module code'; end if;
  if title is null or length(title) > 60 then raise exception 'a shared class needs a name of up to 60 characters'; end if;
  if kind is null or kind not in ('L', 'P', 'T') then raise exception 'a shared class is a lecture, lab or tutorial'; end if;

  select array_agg(distinct x order by x) into d
    from jsonb_array_elements_text(coalesce(p_class -> 'dates', '[]')) x;
  if d is null then raise exception 'a class needs at least one date'; end if;
  if cardinality(d) > 60 then raise exception 'too many dates'; end if;
  -- From yesterday (a class shared on the night) to the end of the year after next.
  if (select min(x::date) from unnest(d) x) < current_date - 1
     or (select max(x::date) from unnest(d) x) > current_date + 400 then
    raise exception 'those dates are out of range';
  end if;

  if (select count(*) from private.shared_class_authors a
       where a.author_id = me and a.created_at > now() - interval '1 day') >= 10 then
    raise exception 'you have shared 10 classes today: try again tomorrow';
  end if;

  insert into public.timetable_changes
    (course_key, grp, kind, module, activity_code, title, dates, start_time, end_time, room, shared, created_by)
  values (
    course,
    null,
    'add',
    module,
    -- What a phone reads the kind of class from: the same shape as an Add class of its own.
    module || '[1]OC/' || kind || '1',
    title,
    d::date[],
    p_class ->> 'start_time',
    p_class ->> 'end_time',
    nullif(btrim(p_class ->> 'room'), ''),
    true,
    -- Kept off the row everyone reads: the author is in private.shared_class_authors.
    null
  )
  returning id into new_id;

  insert into private.shared_class_authors (change_id, author_id) values (new_id, me);
  return new_id;
end $$;

create or replace function public.withdraw_shared_class(p_id uuid) returns boolean
  language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if not exists (select 1 from private.shared_class_authors a where a.change_id = p_id and a.author_id = auth.uid()) then
    return false;
  end if;
  delete from public.timetable_changes c where c.id = p_id and c.shared;
  return found;
end $$;

revoke all    on function public.share_class(jsonb)          from public, anon;
revoke all    on function public.withdraw_shared_class(uuid) from public, anon;
grant execute on function public.share_class(jsonb)          to authenticated;
grant execute on function public.withdraw_shared_class(uuid) to authenticated;
