-- Ellis Adventures partner platform — initial schema.
-- Mirrors the prototype's data store (assets/data.js) one-to-one.
-- Playbook rules applied: RLS enabled in the same migration that creates each table,
-- one policy per operation, role checks through SECURITY DEFINER helpers.

create extension if not exists pgcrypto;

-- =====================================================================
-- Identity: partners (companies) and profiles (people)
-- =====================================================================
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  company text not null check (length(company) between 1 and 160),
  category text,
  website text,
  contact_email text not null,
  contact_phone text,
  status text not null default 'pending' check (status in ('pending', 'active', 'archived')),
  audience_size integer check (audience_size >= 0),
  sms_updates boolean not null default false,
  email_updates boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.partners enable row level security;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('creator', 'partner')),
  partner_id uuid references public.partners (id) on delete cascade,
  full_name text not null,
  title text,
  created_at timestamptz not null default now(),
  constraint partner_role_has_company check ((role = 'partner') = (partner_id is not null))
);
alter table public.profiles enable row level security;

create or replace function public.is_creator()
returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'creator');
$$;

create or replace function public.my_partner_id()
returns uuid language sql security definer set search_path = public stable as $$
  select partner_id from profiles where id = auth.uid();
$$;

create policy "Creators read all partners" on public.partners for select using (public.is_creator());
create policy "Partners read their own company" on public.partners for select using (id = public.my_partner_id());
create policy "Creators update partners" on public.partners for update using (public.is_creator());
create policy "Partners update their own company" on public.partners for update using (id = public.my_partner_id())
  with check (id = public.my_partner_id() and status = (select p.status from public.partners p where p.id = public.my_partner_id()));
-- Partner + profile rows are created by the register function (service role), never directly by clients.

create policy "Creators read all profiles" on public.profiles for select using (public.is_creator());
create policy "People read their own profile and teammates" on public.profiles for select
  using (id = auth.uid() or (partner_id is not null and partner_id = public.my_partner_id()));
-- role and partner_id drive every tenant check in this schema (is_creator / my_partner_id), so clients
-- must never be able to change them. Two layers:
--   1. Column privileges: signed-in users may only edit display fields.
--   2. WITH CHECK pins role AND partner_id to their current values, in case a later migration
--      re-grants table-wide UPDATE. Without (2), a partner could set partner_id to another
--      company's id and read and act as that company.
create policy "People update their own profile" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid()
              and role = (select p.role from public.profiles p where p.id = auth.uid())
              and partner_id is not distinct from (select p.partner_id from public.profiles p where p.id = auth.uid()));
revoke update on public.profiles from anon, authenticated;
grant update (full_name, title) on public.profiles to authenticated;

-- =====================================================================
-- New partnership inquiries (public form → netlify/functions/inquiry.ts)
-- =====================================================================
create table public.inquiries (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  contact_name text not null,
  email text not null,
  phone text,
  website text,
  category text,
  formats text[] not null default '{}',
  budget text,
  timeline text,
  goals text check (length(goals) <= 4000),
  sms_opt_in boolean not null default false,
  status text not null default 'new' check (status in ('new', 'reviewing', 'converted', 'declined')),
  partner_id uuid references public.partners (id),
  client_ip_hash text, -- HMAC of the submitter's IP (never the raw IP), used only for rate limiting
  created_at timestamptz not null default now()
);
create index inquiries_rate_limit_ip on public.inquiries (client_ip_hash, created_at);
create index inquiries_created_at on public.inquiries (created_at);
alter table public.inquiries enable row level security;
create policy "Creators read inquiries" on public.inquiries for select using (public.is_creator());
create policy "Creators update inquiries" on public.inquiries for update using (public.is_creator());
create policy "Partners read their linked inquiry" on public.inquiries for select using (partner_id = public.my_partner_id());
-- No client insert policy: the public form posts to a Netlify Function (validation, bot check, rate limit).

-- =====================================================================
-- Bookings (one table for discovery calls AND existing-partner meetings)
-- =====================================================================
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('discovery', 'checkin', 'review', 'strategy')),
  host text not null check (host in ('kelsey', 'zach', 'both')),
  starts_at timestamptz not null,
  minutes integer not null check (minutes in (30, 45, 60)),
  partner_id uuid references public.partners (id),
  inquiry_id uuid references public.inquiries (id),
  project_id uuid,
  notes text,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  calcom_uid text unique,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint booking_has_owner check (partner_id is not null or inquiry_id is not null)
);
alter table public.bookings enable row level security;
create policy "Creators read bookings" on public.bookings for select using (public.is_creator());
create policy "Creators update bookings" on public.bookings for update using (public.is_creator());
create policy "Partners read their bookings" on public.bookings for select using (partner_id = public.my_partner_id());
create policy "Partners cancel their bookings" on public.bookings for update using (partner_id = public.my_partner_id())
  with check (partner_id = public.my_partner_id() and status = 'cancelled');

-- =====================================================================
-- Collaborations (projects), deliverables, activity
-- =====================================================================
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  proposal_id uuid,
  title text not null,
  format text,
  destination text,
  stage text not null default 'brief' check (stage in ('brief', 'contracted', 'production', 'review', 'live', 'complete')),
  value_cents bigint check (value_cents >= 0),
  starts_on date,
  due_on date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.projects enable row level security;
alter table public.bookings add constraint bookings_project_fk foreign key (project_id) references public.projects (id);
create policy "Creators read projects" on public.projects for select using (public.is_creator());
create policy "Creators insert projects" on public.projects for insert with check (public.is_creator());
create policy "Creators update projects" on public.projects for update using (public.is_creator());
create policy "Partners read their projects" on public.projects for select using (partner_id = public.my_partner_id());
-- Partners never update projects directly; they approve content through approve_content() below.

create table public.deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  due_on date,
  done boolean not null default false,
  position integer not null default 0
);
alter table public.deliverables enable row level security;
create policy "Creators read deliverables" on public.deliverables for select using (public.is_creator());
create policy "Creators insert deliverables" on public.deliverables for insert with check (public.is_creator());
create policy "Creators update deliverables" on public.deliverables for update using (public.is_creator());
create policy "Partners read their deliverables" on public.deliverables for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.partner_id = public.my_partner_id()));

create table public.project_activity (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  actor text not null,
  text text not null,
  created_at timestamptz not null default now()
);
alter table public.project_activity enable row level security;
create policy "Creators read activity" on public.project_activity for select using (public.is_creator());
create policy "Creators insert activity" on public.project_activity for insert with check (public.is_creator());
create policy "Partners read their activity" on public.project_activity for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.partner_id = public.my_partner_id()));

create or replace function public.approve_content(p_project uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update projects set stage = 'live'
   where id = p_project and partner_id = my_partner_id() and stage = 'review';
  if not found then raise exception 'Nothing to approve'; end if;
  insert into project_activity (project_id, actor, text)
  values (p_project, (select full_name from profiles where id = auth.uid()), 'Approved the content — going live');
end $$;

-- Public milestone feed: written by trigger when a collaboration completes. Contains no partner data,
-- so the public site can subscribe to it with Realtime and tick the live counter.
create table public.milestones (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('partnership', 'adventure', 'experience')),
  label text,
  place text,
  created_at timestamptz not null default now()
);
alter table public.milestones enable row level security;
create policy "Anyone reads milestones" on public.milestones for select using (true);
create policy "Creators insert milestones" on public.milestones for insert with check (public.is_creator());

create or replace function public.on_project_complete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage = 'complete' and old.stage is distinct from 'complete' then
    new.completed_at := now();
    insert into milestones (kind) values ('partnership');
  end if;
  return new;
end $$;
create trigger project_complete before update of stage on public.projects
  for each row execute function public.on_project_complete();

create table public.counter_baselines (
  id boolean primary key default true check (id),
  partnerships integer not null default 0,
  adventures integer not null default 0,
  experiences integer not null default 0,
  countries integer not null default 0
);
alter table public.counter_baselines enable row level security;
create policy "Anyone reads baselines" on public.counter_baselines for select using (true);
create policy "Creators update baselines" on public.counter_baselines for update using (public.is_creator());

create view public.live_counters as
  select b.partnerships + (select count(*) from public.milestones where kind = 'partnership') as partnerships,
         b.adventures + (select count(*) from public.milestones where kind = 'adventure') as adventures,
         b.experiences + (select count(*) from public.milestones where kind = 'experience') as experiences,
         b.countries
    from public.counter_baselines b;
grant select on public.live_counters to anon, authenticated;

-- =====================================================================
-- Proposals with version history
-- =====================================================================
create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  from_side text not null check (from_side in ('creator', 'partner')),
  title text not null,
  objective text not null,
  deliverables text not null,
  budget_cents bigint not null check (budget_cents >= 0),
  timeline text not null,
  usage_rights text,
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'in-review', 'changes-requested', 'accepted', 'declined')),
  version integer not null default 1,
  window_id uuid,
  idea_id uuid,
  project_id uuid references public.projects (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.proposals enable row level security;
alter table public.projects add constraint projects_proposal_fk foreign key (proposal_id) references public.proposals (id);
create policy "Creators read proposals" on public.proposals for select using (public.is_creator());
create policy "Creators insert proposals" on public.proposals for insert with check (public.is_creator() and from_side = 'creator');
create policy "Creators update proposals" on public.proposals for update using (public.is_creator());
create policy "Partners read their proposals" on public.proposals for select using (partner_id = public.my_partner_id());
create policy "Partners submit proposals" on public.proposals for insert
  with check (partner_id = public.my_partner_id() and from_side = 'partner' and status = 'submitted' and project_id is null);
-- Decisions and revisions go through decide_proposal() so a partner can't flip arbitrary columns.

create table public.proposal_versions (
  id bigint generated always as identity primary key,
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  version integer not null,
  author text not null,
  note text not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.proposal_versions enable row level security;
create policy "Creators read versions" on public.proposal_versions for select using (public.is_creator());
create policy "Partners read their versions" on public.proposal_versions for select
  using (exists (select 1 from public.proposals p where p.id = proposal_id and p.partner_id = public.my_partner_id()));

create or replace function public.decide_proposal(p_id uuid, p_decision text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  prop proposals%rowtype;
  me profiles%rowtype;
  my_side text;
  new_project uuid;
begin
  select * into prop from proposals where id = p_id for update;
  select * into me from profiles where id = auth.uid();
  if prop.id is null or me.id is null then raise exception 'Not found'; end if;
  my_side := case when me.role = 'creator' then 'creator' else 'partner' end;
  if my_side = 'partner' and prop.partner_id <> me.partner_id then raise exception 'Not allowed'; end if;
  if prop.from_side = my_side then raise exception 'Only the recipient can decide'; end if;
  if prop.status not in ('submitted', 'in-review') then raise exception 'Proposal is %', prop.status; end if;
  if p_decision not in ('accepted', 'declined', 'changes-requested') then raise exception 'Bad decision'; end if;
  if p_decision = 'declined' and my_side = 'partner' then raise exception 'Partners request changes instead'; end if;

  if p_decision = 'accepted' then
    insert into projects (partner_id, proposal_id, title, stage, value_cents, starts_on)
    values (prop.partner_id, prop.id, prop.title, 'contracted', prop.budget_cents, current_date)
    returning id into new_project;
    insert into deliverables (project_id, title, position)
      select new_project, line, ord from unnest(string_to_array(prop.deliverables, E'\n')) with ordinality as t(line, ord)
       where length(trim(line)) > 0;
  end if;

  update proposals set status = p_decision, project_id = coalesce(new_project, project_id), updated_at = now() where id = p_id;
  insert into proposal_versions (proposal_id, version, author, note, snapshot)
  values (p_id, prop.version, me.full_name, coalesce(p_note, initcap(replace(p_decision, '-', ' '))), to_jsonb(prop));
  return new_project;
end $$;

-- =====================================================================
-- Secure messages
-- =====================================================================
create table public.threads (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id),
  subject text not null,
  created_at timestamptz not null default now()
);
alter table public.threads enable row level security;
create policy "Creators read threads" on public.threads for select using (public.is_creator());
create policy "Creators insert threads" on public.threads for insert with check (public.is_creator());
create policy "Partners read their threads" on public.threads for select using (partner_id = public.my_partner_id());
create policy "Partners start threads" on public.threads for insert with check (partner_id = public.my_partner_id());

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads (id) on delete cascade,
  sender_id uuid not null references auth.users (id) default auth.uid(),
  as_creator text check (as_creator in ('kelsey', 'zach')),   -- which creator replied (HQ is one login)
  addressed_to text not null default 'both' check (addressed_to in ('kelsey', 'zach', 'both')),
  body text not null check (length(body) between 1 and 8000),
  attachment_path text,                                        -- private Storage bucket path
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create policy "Creators read messages" on public.messages for select using (public.is_creator());
create policy "Creators send messages" on public.messages for insert
  with check (public.is_creator() and sender_id = auth.uid() and as_creator is not null);
create policy "Partners read their messages" on public.messages for select
  using (exists (select 1 from public.threads t where t.id = thread_id and t.partner_id = public.my_partner_id()));
create policy "Partners send messages" on public.messages for insert
  with check (sender_id = auth.uid() and as_creator is null
              and exists (select 1 from public.threads t where t.id = thread_id and t.partner_id = public.my_partner_id()));

create table public.message_reads (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) default auth.uid(),
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.message_reads enable row level security;
create policy "People read their read receipts" on public.message_reads for select using (user_id = auth.uid());
create policy "People mark messages read" on public.message_reads for insert with check (user_id = auth.uid());

-- =====================================================================
-- Innovation Center
-- =====================================================================
create table public.collab_windows (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  blurb text,
  starts_on date not null,
  length_days integer not null,
  slots integer not null check (slots > 0),
  taken integer not null default 0 check (taken >= 0),
  niches text[] not null default '{}'
);
alter table public.collab_windows enable row level security;
create policy "Signed-in users read windows" on public.collab_windows for select using (auth.role() = 'authenticated');
create policy "Creators insert windows" on public.collab_windows for insert with check (public.is_creator());
create policy "Creators update windows" on public.collab_windows for update using (public.is_creator());
alter table public.proposals add constraint proposals_window_fk foreign key (window_id) references public.collab_windows (id);

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) <= 160),
  pitch text not null check (length(pitch) <= 2000),
  destination text,
  season text,
  niches text[] not null default '{}',
  status text not null default 'open' check (status in ('open', 'shortlisted', 'in-planning', 'greenlit')),
  partner_id uuid references public.partners (id),
  created_by uuid not null references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.ideas enable row level security;
alter table public.proposals add constraint proposals_idea_fk foreign key (idea_id) references public.ideas (id);
-- The idea board is shared across partners on purpose (that's the point of voting) — but only for signed-in, verified partners.
create policy "Verified users read ideas" on public.ideas for select
  using (public.is_creator() or exists (select 1 from public.partners p where p.id = public.my_partner_id() and p.status = 'active'));
create policy "Users pitch ideas" on public.ideas for insert
  with check (created_by = auth.uid() and status = 'open' and (public.is_creator() or partner_id = public.my_partner_id()));
create policy "Creators update ideas" on public.ideas for update using (public.is_creator());

create table public.idea_votes (
  idea_id uuid not null references public.ideas (id) on delete cascade,
  user_id uuid not null references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (idea_id, user_id)
);
alter table public.idea_votes enable row level security;
create policy "Users read votes" on public.idea_votes for select using (auth.role() = 'authenticated');
create policy "Users vote once" on public.idea_votes for insert with check (user_id = auth.uid());
create policy "Users remove their vote" on public.idea_votes for delete using (user_id = auth.uid());

create table public.idea_comments (
  id bigint generated always as identity primary key,
  idea_id uuid not null references public.ideas (id) on delete cascade,
  author_id uuid not null references auth.users (id) default auth.uid(),
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.idea_comments enable row level security;
create policy "Users read idea comments" on public.idea_comments for select using (auth.role() = 'authenticated');
create policy "Users comment" on public.idea_comments for insert with check (author_id = auth.uid());

-- =====================================================================
-- "See what our audience is saying" — curated Instagram comments
-- =====================================================================
create table public.audience_reviews (
  id uuid primary key default gen_random_uuid(),
  ig_comment_id text not null unique,
  ig_media_id text not null,
  account text not null check (account in ('kelsey', 'zach')),
  post_caption text,
  post_permalink text,
  post_thumbnail_url text,
  handle text not null,
  body text not null,
  like_count integer not null default 0,
  commented_at timestamptz not null,
  sentiment numeric(3, 2) not null check (sentiment between 0 and 1),
  brand_safe boolean not null,
  is_testimonial boolean not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden', 'filtered')),
  reviewed_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
alter table public.audience_reviews enable row level security;
create policy "Creators read reviews" on public.audience_reviews for select using (public.is_creator());
create policy "Creators curate reviews" on public.audience_reviews for update using (public.is_creator());

create table public.site_settings (
  id boolean primary key default true check (id),
  review_threshold numeric(3, 2) not null default 0.85,
  mask_handles boolean not null default true,
  quiet_start smallint not null default 22,
  quiet_end smallint not null default 7
);
alter table public.site_settings enable row level security;
create policy "Anyone reads site settings" on public.site_settings for select using (true);
create policy "Creators update site settings" on public.site_settings for update using (public.is_creator());

-- Public wall: approved rows only, handle masked server-side when mask_handles is on.
-- Deliberately a definer view: anon never touches the base table.
create view public.audience_wall with (security_invoker = off) as
  select r.id, r.body, r.like_count, r.commented_at, r.post_caption, r.post_thumbnail_url, r.sentiment,
         case when s.mask_handles then left(r.handle, 3) || '•••' || right(r.handle, 3) else r.handle end as handle
    from public.audience_reviews r cross join public.site_settings s
   where r.status = 'approved';
grant select on public.audience_wall to anon, authenticated;

-- =====================================================================
-- Automations (text + email)
-- =====================================================================
create table public.automation_rules (
  event text primary key,
  label text not null,
  channels text[] not null default '{email}',
  recipients text[] not null default '{kelsey,zach}',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.automation_rules enable row level security;
create policy "Creators read rules" on public.automation_rules for select using (public.is_creator());
create policy "Creators update rules" on public.automation_rules for update using (public.is_creator());

create table public.creator_contacts (
  who text primary key check (who in ('kelsey', 'zach', 'inbox')),
  sms text,
  email text
);
alter table public.creator_contacts enable row level security;
create policy "Creators read contacts" on public.creator_contacts for select using (public.is_creator());
create policy "Creators update contacts" on public.creator_contacts for update using (public.is_creator());

create table public.notification_log (
  id bigint generated always as identity primary key,
  event text not null,
  channel text not null check (channel in ('sms', 'email')),
  recipient text not null,
  address text not null,
  subject text,
  body text not null,
  status text not null check (status in ('sent', 'queued', 'failed')),
  provider_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.notification_log enable row level security;
create policy "Creators read the log" on public.notification_log for select using (public.is_creator());

insert into public.counter_baselines default values;
insert into public.site_settings default values;
insert into public.automation_rules (event, label, channels, recipients) values
  ('inquiry.created',    'New partnership inquiry',    '{sms,email}', '{kelsey,zach,inbox,partner}'),
  ('booking.created',    'Call booked',                '{sms,email}', '{kelsey,zach,partner}'),
  ('message.received',   'New direct message',         '{sms,email}', '{kelsey,zach}'),
  ('message.reply',      'Reply to partner',           '{email}',     '{partner}'),
  ('proposal.submitted', 'Proposal submitted',         '{sms,email}', '{kelsey,zach}'),
  ('proposal.sent',      'Proposal sent to partner',   '{sms,email}', '{partner}'),
  ('proposal.decision',  'Proposal decision',          '{email}',     '{kelsey,zach,partner}'),
  ('partner.registered', 'New partner account',        '{sms,email}', '{kelsey,zach}'),
  ('partner.invited',    'Partner invited',            '{email}',     '{partner}'),
  ('project.stage',      'Collaboration stage change', '{email}',     '{kelsey,zach,partner}'),
  ('idea.trending',      'Idea is trending',           '{email}',     '{kelsey,zach}'),
  ('review.pending',     'Comments ready to approve',  '{email}',     '{kelsey}');

-- Realtime: the public site listens for milestones; the portal listens for its own messages
-- (Realtime honours the RLS policies above).
alter publication supabase_realtime add table public.milestones, public.messages;

-- Database Webhooks (Dashboard → Database → Webhooks) → POST {SITE_URL}/.netlify/functions/notify
-- with header x-webhook-secret: <NOTIFY_WEBHOOK_SECRET>:
--   INSERT on inquiries, bookings, messages, proposals, profiles, idea_votes
--   UPDATE on proposals, projects
