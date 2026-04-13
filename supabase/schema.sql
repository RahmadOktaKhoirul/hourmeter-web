-- ============================================================
-- HM GGF Kinetic Ledger - Supabase Schema
-- Jalankan file ini di Supabase Dashboard > SQL Editor
-- ============================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- BUSINESS UNITS
-- ============================================================
create table public.business_units (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  location text not null,
  status text not null default 'Active' check (status in ('Active', 'Maintenance', 'Inactive')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- MACHINES
-- ============================================================
create table public.machines (
  id uuid primary key default uuid_generate_v4(),
  machine_code text not null unique,
  unit_name text not null,
  serial_number text,
  tier text default 'Tier 4 Industrial',
  business_unit_id uuid references public.business_units(id) on delete set null,
  status text not null default 'STOPPED' check (status in ('RUNNING', 'STOPPED', 'MAINTENANCE')),
  service_status text not null default 'OK' check (service_status in ('OK', 'OVERDUE', 'SCHEDULED')),
  current_hm numeric(10,1) not null default 0,
  previous_hm numeric(10,1) not null default 0,
  hours_to_service numeric(10,1) default 500,
  service_interval numeric(10,1) default 500,
  created_at timestamptz not null default now()
);

-- ============================================================
-- APP USERS
-- ============================================================
create table public.app_users (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text not null unique,
  role text not null default 'Operator' check (role in ('Fleet Overseer', 'Unit Manager', 'Maintenance Lead', 'Operator')),
  status text not null default 'Offline' check (status in ('Online', 'Offline', 'Away')),
  avatar_url text,
  business_unit_id uuid references public.business_units(id) on delete set null,
  password_hash text not null default '',
  last_active_at timestamptz default now(),
  created_at timestamptz not null default now()
);

-- Function: verifikasi password
create or replace function public.verify_user_password(p_email text, p_password text)
returns table(id uuid, name text, email text, role text, status text, avatar_url text, business_unit_id uuid)
language plpgsql security definer as $$
begin
  return query
  select u.id, u.name, u.email, u.role, u.status, u.avatar_url, u.business_unit_id
  from public.app_users u
  where u.email = p_email
    and u.password_hash = crypt(p_password, u.password_hash);
end;
$$;

-- ============================================================
-- SHIFTS
-- ============================================================
create table public.shifts (
  id uuid primary key default uuid_generate_v4(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  operator_id uuid references public.app_users(id) on delete set null,
  operator_name text not null,
  hm_start numeric(10,1) not null,
  hm_end numeric(10,1),
  hours_logged numeric(10,1) generated always as (
    case when hm_end is not null then hm_end - hm_start else null end
  ) stored,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- TELEMETRY LOGS
-- ============================================================
create table public.telemetry_logs (
  id uuid primary key default uuid_generate_v4(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  event_type text not null check (event_type in ('ALERT', 'START', 'STOP', 'OPERATOR_SWAP', 'SERVICE', 'INFO')),
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- SERVICE RECORDS
-- ============================================================
create table public.service_records (
  id uuid primary key default uuid_generate_v4(),
  machine_id uuid not null references public.machines(id) on delete cascade,
  performed_by text not null,
  hm_at_service numeric(10,1) not null,
  notes text,
  next_service_hm numeric(10,1),
  serviced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ============================================================
-- REPORTS
-- ============================================================
create table public.reports (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  type text not null check (type in ('Analytics', 'Compliance', 'Forecast', 'Operational')),
  file_url text,
  file_size text,
  business_unit_id uuid references public.business_units(id) on delete set null,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.business_units enable row level security;
alter table public.machines enable row level security;
alter table public.app_users enable row level security;
alter table public.shifts enable row level security;
alter table public.telemetry_logs enable row level security;
alter table public.service_records enable row level security;
alter table public.reports enable row level security;

create policy "allow_all" on public.business_units for all using (true) with check (true);
create policy "allow_all" on public.machines for all using (true) with check (true);
create policy "allow_all" on public.app_users for all using (true) with check (true);
create policy "allow_all" on public.shifts for all using (true) with check (true);
create policy "allow_all" on public.telemetry_logs for all using (true) with check (true);
create policy "allow_all" on public.service_records for all using (true) with check (true);
create policy "allow_all" on public.reports for all using (true) with check (true);

-- ============================================================
-- SEED DATA
-- ============================================================

insert into public.business_units (id, name, location, status) values
  ('11111111-0000-0000-0000-000000000001', 'Central Mining Hub', 'Kalimantan', 'Active'),
  ('11111111-0000-0000-0000-000000000002', 'Northern Excavation', 'Sumatra', 'Active'),
  ('11111111-0000-0000-0000-000000000003', 'Eastern Logistics', 'Papua', 'Maintenance'),
  ('11111111-0000-0000-0000-000000000004', 'Southern Fleet', 'Java', 'Active');

insert into public.machines (machine_code, unit_name, serial_number, business_unit_id, status, service_status, current_hm, previous_hm, hours_to_service, service_interval) values
  ('EXC-204-G', 'Excavator Series 7', '24-AG-99', '11111111-0000-0000-0000-000000000001', 'RUNNING', 'OK', 1240.5, 1228.1, 259.5, 500),
  ('DRL-882-X', 'Vertical Drill Rig', '22-DR-14', '11111111-0000-0000-0000-000000000002', 'STOPPED', 'OVERDUE', 4912.8, 4900.7, 0, 500),
  ('TRK-440-S', 'Heavy Hauler Unit', '23-TK-07', '11111111-0000-0000-0000-000000000001', 'RUNNING', 'OK', 852.1, 841.6, 147.9, 500),
  ('LDR-009-P', 'Wheel Loader 40T', '21-LD-33', '11111111-0000-0000-0000-000000000004', 'RUNNING', 'OK', 2311.0, 2299.5, 189.0, 500),
  ('EXC-215-G', 'Excavator Series 7', '24-AG-15', '11111111-0000-0000-0000-000000000003', 'STOPPED', 'OK', 1180.4, 1168.9, 319.6, 500),
  ('EXCAV-A24', 'Excavator Series 7', '24-AG-A24', '11111111-0000-0000-0000-000000000001', 'RUNNING', 'OK', 8421.5, 8409.1, 78.5, 500);

-- Password default semua user: Admin@1234
insert into public.app_users (name, email, role, status, business_unit_id, password_hash) values
  ('Alex Henderson', 'a.henderson@ggf.com', 'Fleet Overseer', 'Online', '11111111-0000-0000-0000-000000000001', crypt('Admin@1234', gen_salt('bf'))),
  ('Sarah Jenkins', 's.jenkins@ggf.com', 'Unit Manager', 'Offline', '11111111-0000-0000-0000-000000000002', crypt('Admin@1234', gen_salt('bf'))),
  ('Michael Chen', 'm.chen@ggf.com', 'Maintenance Lead', 'Online', '11111111-0000-0000-0000-000000000001', crypt('Admin@1234', gen_salt('bf'))),
  ('Robert Wilson', 'r.wilson@ggf.com', 'Operator', 'Away', '11111111-0000-0000-0000-000000000004', crypt('Admin@1234', gen_salt('bf')));

insert into public.telemetry_logs (machine_id, event_type, title, description, created_at)
select m.id, 'ALERT', 'Unit TK-402 Low Pressure', 'Hydraulic pressure below threshold', now() - interval '2 hours'
from public.machines m where m.machine_code = 'TRK-440-S';

insert into public.telemetry_logs (machine_id, event_type, title, description, created_at)
select m.id, 'START', 'Machine HM-883 Started', 'Engine ignition confirmed', now() - interval '4 hours'
from public.machines m where m.machine_code = 'EXC-204-G';

insert into public.telemetry_logs (machine_id, event_type, title, description, created_at)
select m.id, 'OPERATOR_SWAP', 'Operator Swap: HM-104', 'Shift handover completed', now() - interval '1 day'
from public.machines m where m.machine_code = 'LDR-009-P';

insert into public.telemetry_logs (machine_id, event_type, title, description, created_at)
select m.id, 'SERVICE', 'Service Completed: Unit RX-9', 'Scheduled maintenance done', now() - interval '1 day 8 hours'
from public.machines m where m.machine_code = 'EXC-215-G';

insert into public.reports (title, type, file_size, business_unit_id, created_at) values
  ('Fleet Utilization Q1', 'Analytics', '2.4 MB', '11111111-0000-0000-0000-000000000001', now() - interval '3 days'),
  ('Compliance Audit: Kalimantan', 'Compliance', '1.1 MB', '11111111-0000-0000-0000-000000000001', now() - interval '5 days'),
  ('Maintenance Forecast 2024', 'Forecast', '4.8 MB', null, now() - interval '10 days'),
  ('Fuel Efficiency Ledger', 'Operational', '850 KB', '11111111-0000-0000-0000-000000000004', now() - interval '17 days');
