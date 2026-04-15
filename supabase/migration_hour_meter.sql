-- ============================================================
-- Migration: Integrasi hour_meter_logs dengan machines
-- Jalankan di Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Tambah kolom device_id ke machines
--    Digunakan untuk mapping: hour_meter_logs.machine_id → machines
--    Contoh: device_id = 'machine_1' → EXC-204-G
alter table public.machines
  add column if not exists device_id text unique;

-- 2. Index agar query hour_meter_logs cepat
create index if not exists idx_hml_machine_created
  on public.hour_meter_logs(machine_id, created_at desc);

-- 3. Update upsert_machine_mqtt — sekarang juga insert ke hour_meter_logs
--    sehingga data dari MQTT bridge tersimpan di kedua tabel
create or replace function public.upsert_machine_mqtt(
  p_machine_code text,
  p_hm_sec numeric,
  p_prev_hm_sec numeric,
  p_engine_running boolean,
  p_client_id text
) returns void
language plpgsql security definer as $$
declare
  v_device_id text;
begin
  -- Update tabel machines
  update public.machines
  set
    hm_seconds   = p_hm_sec,
    current_hm   = round((p_hm_sec / 3600.0)::numeric, 1),
    previous_hm  = round((p_prev_hm_sec / 3600.0)::numeric, 1),
    status       = case when p_engine_running then 'RUNNING' else 'STOPPED' end,
    last_mqtt_at = now()
  where machine_code = p_machine_code
  returning device_id into v_device_id;

  -- Insert log ke hour_meter_logs (pakai device_id jika ada, fallback ke machine_code)
  insert into public.hour_meter_logs (machine_id, hm_seconds, hm_hours, status, timestamp_device)
  values (
    coalesce(v_device_id, p_machine_code),
    p_hm_sec::int8,
    round((p_hm_sec / 3600.0)::numeric, 2),
    case when p_engine_running then 'RUNNING' else 'STOPPED' end,
    to_char(now() at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
  );
end;
$$;

-- ============================================================
-- RPC: Ambil status terbaru per mesin dari hour_meter_logs
-- Dipanggil oleh web app untuk menampilkan kondisi live
-- ============================================================
create or replace function public.get_latest_hm_per_machine()
returns table (
  machine_id    text,
  hm_seconds    int8,
  hm_hours      numeric,
  status        text,
  last_seen_at  timestamptz
)
language sql stable security definer as $$
  select distinct on (machine_id)
    machine_id,
    hm_seconds,
    hm_hours,
    status,
    created_at as last_seen_at
  from public.hour_meter_logs
  order by machine_id, created_at desc;
$$;

-- ============================================================
-- RPC: Ambil data chart mingguan dari hour_meter_logs
-- Menghitung jam operasi per hari (max HM - min HM per hari)
-- ============================================================
create or replace function public.get_weekly_hm_chart(p_machine_id text)
returns table (
  day_label   text,
  op_hours    numeric
)
language sql stable security definer as $$
  with week_days as (
    select generate_series(
      date_trunc('week', now()),
      date_trunc('week', now()) + interval '6 days',
      interval '1 day'
    )::date as day
  ),
  daily as (
    select
      date(created_at) as day,
      round((max(hm_hours) - min(hm_hours))::numeric, 2) as op_hours
    from public.hour_meter_logs
    where machine_id = p_machine_id
      and created_at >= date_trunc('week', now())
      and created_at <  date_trunc('week', now()) + interval '7 days'
    group by date(created_at)
  )
  select
    to_char(w.day, 'DY') as day_label,
    coalesce(d.op_hours, 0) as op_hours
  from week_days w
  left join daily d on d.day = w.day
  order by w.day;
$$;
