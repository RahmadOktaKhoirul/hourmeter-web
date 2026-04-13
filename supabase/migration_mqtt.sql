-- ============================================================
-- MIGRATION: Integrasi data MQTT dari ESP32 / Flutter
-- Jalankan di Supabase Dashboard > SQL Editor
-- ============================================================

-- ── 1. Tambah kolom MQTT ke tabel machines ─────────────────
alter table public.machines
  add column if not exists hm_seconds       bigint        not null default 0,
  add column if not exists engine_running   boolean       not null default false,
  add column if not exists tick_ms          integer       not null default 1000,
  add column if not exists shift_hours      numeric(5,1)  not null default 8,
  add column if not exists last_mqtt_at     timestamptz,
  add column if not exists mqtt_client_id   text;

-- Sync current_hm dari hm_seconds yang sudah ada (jika ada data seed)
update public.machines
set hm_seconds = (current_hm * 3600)::bigint
where hm_seconds = 0 and current_hm > 0;

-- ── 2. Tabel daily_operation — data jam operasi per hari ────
create table if not exists public.daily_operation (
  id          uuid        primary key default uuid_generate_v4(),
  machine_id  uuid        not null references public.machines(id) on delete cascade,
  date        date        not null,
  hours       numeric(8,4) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (machine_id, date)
);

alter table public.daily_operation enable row level security;
create policy "allow_all" on public.daily_operation for all using (true) with check (true);

-- ── 3. Function: upsert data MQTT dari ESP32 ───────────────
-- Dipanggil oleh Flutter/ESP32 bridge atau langsung via REST
create or replace function public.upsert_machine_mqtt(
  p_machine_code  text,
  p_hm_sec        bigint,
  p_prev_hm_sec   bigint,
  p_engine_running boolean,
  p_client_id     text default null
)
returns void
language plpgsql security definer as $$
declare
  v_machine_id    uuid;
  v_old_hm_sec    bigint;
  v_delta_sec     bigint;
  v_today         date := current_date;
  v_new_hm        numeric(10,1);
  v_new_prev_hm   numeric(10,1);
  v_service_int   numeric(10,1);
  v_last_svc_hm   numeric(10,1);
  v_hours_to_svc  numeric(10,1);
  v_svc_status    text;
begin
  -- Cari machine
  select id, hm_seconds, service_interval
  into v_machine_id, v_old_hm_sec, v_service_int
  from public.machines
  where machine_code = p_machine_code;

  if not found then return; end if;

  -- Hitung nilai HM dalam jam
  v_new_hm      := round((p_hm_sec      / 3600.0)::numeric, 1);
  v_new_prev_hm := round((p_prev_hm_sec / 3600.0)::numeric, 1);

  -- Hitung delta untuk daily_operation (hanya jika engine running dan ada kenaikan)
  v_delta_sec := p_hm_sec - v_old_hm_sec;
  if v_delta_sec > 0 and v_delta_sec < 3600 and p_engine_running then
    insert into public.daily_operation (machine_id, date, hours)
    values (v_machine_id, v_today, round(v_delta_sec / 3600.0, 4))
    on conflict (machine_id, date)
    do update set
      hours      = daily_operation.hours + round(v_delta_sec / 3600.0, 4),
      updated_at = now();
  end if;

  -- Hitung service status
  select coalesce(max(hm_at_service), 0)
  into v_last_svc_hm
  from public.service_records
  where machine_id = v_machine_id;

  v_hours_to_svc := coalesce(v_service_int, 500) - (v_new_hm - v_last_svc_hm);
  v_svc_status := case
    when v_hours_to_svc <= 0  then 'OVERDUE'
    when v_hours_to_svc <= 20 then 'SCHEDULED'
    else 'OK'
  end;

  -- Update machines
  update public.machines set
    hm_seconds      = p_hm_sec,
    current_hm      = v_new_hm,
    previous_hm     = v_new_prev_hm,
    engine_running  = p_engine_running,
    status          = case when p_engine_running then 'RUNNING' else 'STOPPED' end,
    service_status  = v_svc_status,
    hours_to_service = greatest(v_hours_to_svc, 0),
    last_mqtt_at    = now(),
    mqtt_client_id  = coalesce(p_client_id, mqtt_client_id)
  where id = v_machine_id;

end;
$$;

-- ── 4. Function: insert log dari MQTT ──────────────────────
create or replace function public.insert_mqtt_log(
  p_machine_code text,
  p_event        text,
  p_prev_hm_hours numeric,
  p_timestamp    text default null
)
returns void
language plpgsql security definer as $$
declare
  v_machine_id uuid;
  v_event_type text;
  v_title      text;
  v_ts         timestamptz;
begin
  select id into v_machine_id
  from public.machines where machine_code = p_machine_code;
  if not found then return; end if;

  -- Map event dari ESP32/Flutter ke event_type tabel
  v_event_type := case
    when p_event = 'RESET'              then 'STOP'
    when p_event like 'ADJUST%'         then 'INFO'
    when p_event like 'SPEED%'          then 'INFO'
    when p_event like 'SERVICE DONE%'   then 'SERVICE'
    when p_event like 'Service Sched%'  then 'SERVICE'
    when p_event = 'BOOT'               then 'START'
    else 'INFO'
  end;

  v_title := p_machine_code || ': ' || p_event;

  -- Parse timestamp dari Flutter format "YYYY-MM-DD HH:MM:SS"
  begin
    v_ts := to_timestamp(p_timestamp, 'YYYY-MM-DD HH24:MI:SS');
  exception when others then
    v_ts := now();
  end;

  insert into public.telemetry_logs (machine_id, event_type, title, description, created_at)
  values (v_machine_id, v_event_type, v_title,
          'HM saat event: ' || round(p_prev_hm_hours, 2) || ' h', v_ts);
end;
$$;

-- ── 5. Function: get weekly chart data ─────────────────────
create or replace function public.get_weekly_chart(p_machine_id uuid default null)
returns table(day_name text, op_hours numeric, idle_hours numeric)
language plpgsql security definer as $$
declare
  v_monday date := date_trunc('week', current_date)::date;
begin
  return query
  select
    to_char(d.day, 'DY') as day_name,
    coalesce(sum(do2.hours), 0)::numeric(8,2) as op_hours,
    0::numeric as idle_hours
  from generate_series(v_monday, v_monday + 6, '1 day'::interval) as d(day)
  left join public.daily_operation do2
    on do2.date = d.day::date
    and (p_machine_id is null or do2.machine_id = p_machine_id)
  group by d.day
  order by d.day;
end;
$$;

-- ── 6. RLS untuk daily_operation ───────────────────────────
-- (sudah dibuat di atas, pastikan tidak duplikat)

-- ── 7. Seed daily_operation dari data shifts yang ada ──────
-- Isi data harian dari shifts yang sudah ada
insert into public.daily_operation (machine_id, date, hours)
select
  machine_id,
  started_at::date as date,
  coalesce(sum(hours_logged), 0) as hours
from public.shifts
where hours_logged is not null
group by machine_id, started_at::date
on conflict (machine_id, date)
do update set hours = excluded.hours, updated_at = now();

-- ── 8. Tambah kolom mqtt_topic ke machines (opsional) ──────
-- Untuk identifikasi topic MQTT per mesin
alter table public.machines
  add column if not exists mqtt_topic text;

-- Set default topic berdasarkan machine_code
update public.machines
set mqtt_topic = 'factory/' || lower(replace(machine_code, '-', '_')) || '/hm/data'
where mqtt_topic is null;
