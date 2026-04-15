-- =================================================================
-- HM GGF — Schema Lengkap dari Nol
-- Supabase Dashboard > SQL Editor > Paste & Run
--
-- Urutan eksekusi penting — jangan diubah urutannya.
-- =================================================================

-- -----------------------------------------------------------------
-- 0. EKSTENSI
-- -----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- bcrypt password hashing
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- gen_random_uuid()


-- -----------------------------------------------------------------
-- 0.1 DROP FUNCTIONS LAMA (hindari conflict return type)
-- -----------------------------------------------------------------
DROP FUNCTION IF EXISTS public.verify_user_password(text,text);
DROP FUNCTION IF EXISTS public.create_app_user(text,text,text,text,uuid,text);
DROP FUNCTION IF EXISTS public.update_user_password(uuid,text);
DROP FUNCTION IF EXISTS public.get_latest_hm_per_machine();
DROP FUNCTION IF EXISTS public.get_weekly_hm_chart(text);
DROP FUNCTION IF EXISTS public.upsert_machine_mqtt(text,numeric,numeric,boolean,text);
DROP FUNCTION IF EXISTS public.upsert_machine_mqtt(text,numeric,numeric,boolean);
DROP FUNCTION IF EXISTS public.fn_update_service_status();
DROP FUNCTION IF EXISTS public.fn_sync_machine_from_hml();
DROP FUNCTION IF EXISTS public.fn_mark_overdue_schedules();


-- =================================================================
-- BAGIAN 1: TABEL MASTER
-- =================================================================

-- -----------------------------------------------------------------
-- 1.1 BUSINESS UNITS
--     Induk dari machines dan app_users
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_units (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  location   TEXT        NOT NULL DEFAULT '',
  status     TEXT        NOT NULL DEFAULT 'Active'
               CHECK (status IN ('Active', 'Maintenance', 'Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.business_units             IS 'Unit bisnis / divisi perusahaan';
COMMENT ON COLUMN public.business_units.status      IS 'Active | Maintenance | Inactive';


-- -----------------------------------------------------------------
-- 1.2 MACHINES
--     Satu mesin fisik = satu baris.
--     device_id adalah kunci penghubung ke data IoT dari ESP32.
--     Contoh: device_id = 'machine_1' sesuai konstanta di firmware.
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.machines (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_code     TEXT         NOT NULL UNIQUE,          -- "EXC-204-G"
  unit_name        TEXT         NOT NULL,                 -- "Excavator Series 7"
  serial_number    TEXT,
  tier             TEXT,                                  -- "Tier 4 Industrial"
  business_unit_id UUID         REFERENCES public.business_units(id) ON DELETE SET NULL,

  -- ── Tipe unit alat berat ─────────────────────────────────────
  unit_type        TEXT
                     CHECK (unit_type IN ('BSC', 'BDF')), -- BSC atau BDF

  -- ── Penghubung ke data ESP32 ──────────────────────────────────
  -- Nilai ini harus sama persis dengan machine_id yang dikirim ESP32
  -- Contoh firmware: "machine_id":"machine_1"
  device_id        TEXT         UNIQUE,                   -- "machine_1"

  -- ── Status operasional (di-update via MQTT bridge) ───────────
  status           TEXT         NOT NULL DEFAULT 'STOPPED'
                     CHECK (status IN ('RUNNING','STOPPED','MAINTENANCE')),

  -- ── Data hour meter (di-sync dari hour_meter_logs) ───────────
  current_hm       NUMERIC(10,1) NOT NULL DEFAULT 0,      -- jam (jam, 1 desimal)
  previous_hm      NUMERIC(10,1) NOT NULL DEFAULT 0,      -- HM sebelum reset terakhir
  hm_seconds       BIGINT        NOT NULL DEFAULT 0,      -- raw detik dari ESP32

  -- ── Service tracking ─────────────────────────────────────────
  service_status   TEXT         NOT NULL DEFAULT 'OK'
                     CHECK (service_status IN ('OK','SCHEDULED','OVERDUE')),
  service_interval  INTEGER      DEFAULT 500,             -- jam antar service
  hours_to_service  NUMERIC(10,1) DEFAULT 500,            -- sisa jam menuju service

  -- ── Metadata koneksi ─────────────────────────────────────────
  last_mqtt_at     TIMESTAMPTZ,                           -- terakhir terima MQTT
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.machines             IS 'Master data mesin / unit alat berat';
COMMENT ON COLUMN public.machines.device_id   IS 'Harus sama dengan machine_id di firmware ESP32 (contoh: machine_1)';
COMMENT ON COLUMN public.machines.hm_seconds  IS 'Cache raw detik dari ESP32, sinkron dengan hour_meter_logs';

CREATE INDEX IF NOT EXISTS idx_machines_device_id
  ON public.machines (device_id);
CREATE INDEX IF NOT EXISTS idx_machines_business_unit
  ON public.machines (business_unit_id);


-- =================================================================
-- BAGIAN 2: DATA IoT DARI ESP32
-- =================================================================

-- -----------------------------------------------------------------
-- 2.1 HOUR METER LOGS
--     Tabel ini diisi LANGSUNG oleh ESP32 via HTTP POST ke Supabase REST API.
--
--     Kapan ESP32 mengirim data:
--       • Setiap 60 detik selama mesin RUNNING (periodic sync)
--       • Saat mesin berhenti (engine stop event)
--       • Saat pertama kali menyala (BOOT)
--       • Setelah reset hour meter (RESET)
--       • Setelah kalibrasi manual (ADJUST)
--
--     Payload dari firmware:
--       { "machine_id":"machine_1", "hm_seconds":12345,
--         "hm_hours":3.43, "status":"RUNNING",
--         "timestamp_device":"2025-01-15 08:30:00" }
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hour_meter_logs (
  id               BIGSERIAL    PRIMARY KEY,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),   -- waktu server menerima

  -- ── Data dari firmware ────────────────────────────────────────
  machine_id       TEXT         NOT NULL,                 -- "machine_1" (bukan UUID)
  hm_seconds       BIGINT       NOT NULL CHECK (hm_seconds >= 0),
  hm_hours         NUMERIC(10,2) NOT NULL CHECK (hm_hours >= 0),
  status           TEXT         NOT NULL
                     CHECK (status IN ('RUNNING','STOPPED')),
  timestamp_device TEXT                                   -- timestamp NTP dari device
);

COMMENT ON TABLE  public.hour_meter_logs              IS 'Log raw dari ESP32 — JANGAN hapus, sumber kebenaran data IoT';
COMMENT ON COLUMN public.hour_meter_logs.machine_id   IS 'Teks dari ESP32, bukan UUID. Terhubung ke machines.device_id';
COMMENT ON COLUMN public.hour_meter_logs.hm_seconds   IS 'Total detik akumulasi dari NVS ESP32';
COMMENT ON COLUMN public.hour_meter_logs.timestamp_device IS 'Waktu NTP lokal (WIB) dari ESP32';

-- Index utama: query per device, urut terbaru
CREATE INDEX IF NOT EXISTS idx_hml_machine_created
  ON public.hour_meter_logs (machine_id, created_at DESC);

-- Index untuk query range waktu
CREATE INDEX IF NOT EXISTS idx_hml_created_at
  ON public.hour_meter_logs (created_at DESC);


-- =================================================================
-- BAGIAN 3: PENGGUNA SISTEM
-- =================================================================

-- -----------------------------------------------------------------
-- 3.1 APP USERS
--     Password di-hash menggunakan bcrypt via pgcrypto.
--     Login menggunakan RPC verify_user_password (tidak expose hash).
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_users (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT         NOT NULL,
  email            TEXT         NOT NULL UNIQUE,
  password_hash    TEXT         NOT NULL,                 -- bcrypt $2a$...
  role             TEXT         NOT NULL DEFAULT 'Operator'
                     CHECK (role IN (
                       'Fleet Overseer',
                       'Unit Manager',
                       'Maintenance Lead',
                       'Operator'
                     )),
  status           TEXT         NOT NULL DEFAULT 'Offline'
                     CHECK (status IN ('Online','Offline','Away')),
  avatar_url       TEXT,
  business_unit_id UUID         REFERENCES public.business_units(id) ON DELETE SET NULL,
  last_active_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.app_users               IS 'Pengguna aplikasi web, password bcrypt';
COMMENT ON COLUMN public.app_users.password_hash IS 'Hash bcrypt dari pgcrypto.crypt(). JANGAN expose ke client';

CREATE INDEX IF NOT EXISTS idx_app_users_email
  ON public.app_users (email);
CREATE INDEX IF NOT EXISTS idx_app_users_business_unit
  ON public.app_users (business_unit_id);


-- =================================================================
-- BAGIAN 4: AKTIVITAS OPERASIONAL
-- =================================================================

-- -----------------------------------------------------------------
-- 4.1 SHIFTS
--     Sesi kerja operator per mesin.
--     hours_logged dihitung otomatis saat shift ditutup (hm_end diisi).
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shifts (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id    UUID         NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  operator_id   UUID         REFERENCES public.app_users(id) ON DELETE SET NULL,
  operator_name TEXT         NOT NULL,
  hm_start      NUMERIC(10,1) NOT NULL,
  hm_end        NUMERIC(10,1),
  hours_logged  NUMERIC(10,1)
                  GENERATED ALWAYS AS (
                    CASE WHEN hm_end IS NOT NULL THEN hm_end - hm_start ELSE NULL END
                  ) STORED,
  started_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ended_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.shifts              IS 'Sesi operasi mesin per operator';
COMMENT ON COLUMN public.shifts.hours_logged IS 'Dihitung otomatis: hm_end - hm_start';

CREATE INDEX IF NOT EXISTS idx_shifts_machine
  ON public.shifts (machine_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_shifts_operator
  ON public.shifts (operator_id);


-- -----------------------------------------------------------------
-- 4.2 TELEMETRY LOGS
--     Log event penting mesin: start, stop, alert, service, dll.
--     Bisa diisi dari web maupun MQTT bridge.
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.telemetry_logs (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id  UUID         NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  event_type  TEXT         NOT NULL
                CHECK (event_type IN (
                  'ALERT','START','STOP',
                  'OPERATOR_SWAP','SERVICE','INFO',
                  'RESET','ADJUST','BOOT'            -- event dari ESP32 via MQTT
                )),
  title       TEXT         NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.telemetry_logs IS 'Log event mesin — dari web dan MQTT bridge (BOOT/RESET/ADJUST dari ESP32)';

CREATE INDEX IF NOT EXISTS idx_telemetry_machine
  ON public.telemetry_logs (machine_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_event_type
  ON public.telemetry_logs (event_type);


-- =================================================================
-- BAGIAN 5: PERAWATAN MESIN
-- =================================================================

-- -----------------------------------------------------------------
-- 5.1 SERVICE RECORDS
--     Riwayat perawatan yang sudah dilakukan.
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_records (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id      UUID         NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  performed_by    TEXT         NOT NULL,                  -- nama teknisi
  hm_at_service   NUMERIC(10,1) NOT NULL,                 -- HM saat service dilakukan
  notes           TEXT,
  next_service_hm NUMERIC(10,1),                         -- target HM service berikutnya
  serviced_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.service_records IS 'Riwayat perawatan yang sudah dilakukan';

CREATE INDEX IF NOT EXISTS idx_svc_records_machine
  ON public.service_records (machine_id, serviced_at DESC);


-- -----------------------------------------------------------------
-- 5.2 SERVICE SCHEDULES
--     Jadwal perawatan ke depan.
--     Status otomatis berubah menjadi Overdue via trigger.
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.service_schedules (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id     UUID         NOT NULL REFERENCES public.machines(id) ON DELETE CASCADE,
  scheduled_date DATE         NOT NULL,
  hm_target      INTEGER      NOT NULL CHECK (hm_target > 0),  -- jam target service
  description    TEXT,
  status         TEXT         NOT NULL DEFAULT 'Pending'
                   CHECK (status IN ('Pending','Done','Overdue')),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.service_schedules IS 'Jadwal service ke depan. Status Overdue jika tanggal lewat dan masih Pending';

CREATE INDEX IF NOT EXISTS idx_svc_sched_machine
  ON public.service_schedules (machine_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_svc_sched_status
  ON public.service_schedules (status, scheduled_date);


-- =================================================================
-- BAGIAN 6: LAPORAN
-- =================================================================

-- -----------------------------------------------------------------
-- 6.1 REPORTS
-- -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reports (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT         NOT NULL,
  type             TEXT         NOT NULL
                     CHECK (type IN (
                       'Analytics','Compliance','Forecast','Operational'
                     )),
  file_url         TEXT,
  file_size        TEXT,
  business_unit_id UUID         REFERENCES public.business_units(id) ON DELETE SET NULL,
  created_by       UUID         REFERENCES public.app_users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.reports IS 'Dokumen laporan operasional';

CREATE INDEX IF NOT EXISTS idx_reports_business_unit
  ON public.reports (business_unit_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_by
  ON public.reports (created_by);


-- =================================================================
-- BAGIAN 7: TRIGGER OTOMATIS
-- =================================================================

-- -----------------------------------------------------------------
-- 7.1 Auto-update service_status mesin
--     Dipicu saat current_hm atau hours_to_service berubah.
--     OVERDUE  : hours_to_service <= 0
--     SCHEDULED: hours_to_service <= 50 jam (threshold peringatan)
--     OK       : hours_to_service > 50
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_update_service_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.hours_to_service IS NOT NULL THEN
    NEW.service_status :=
      CASE
        WHEN NEW.hours_to_service <= 0   THEN 'OVERDUE'
        WHEN NEW.hours_to_service <= 50  THEN 'SCHEDULED'
        ELSE 'OK'
      END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_service_status ON public.machines;
CREATE TRIGGER trg_update_service_status
  BEFORE UPDATE OF current_hm, hours_to_service ON public.machines
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_service_status();


-- -----------------------------------------------------------------
-- 7.2 Auto-mark service_schedules menjadi Overdue
--     Dijalankan via pg_cron setiap hari, atau dipanggil manual.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_mark_overdue_schedules()
RETURNS VOID LANGUAGE sql AS $$
  UPDATE public.service_schedules
    SET status = 'Overdue'
    WHERE status = 'Pending'
      AND scheduled_date < CURRENT_DATE;
$$;

COMMENT ON FUNCTION public.fn_mark_overdue_schedules IS
  'Tandai jadwal service lewat tanggal sebagai Overdue. Panggil via cron harian.';


-- -----------------------------------------------------------------
-- 7.3 Auto-sync machines dari hour_meter_logs (via trigger INSERT)
--     Saat ESP32 POST data baru ke hour_meter_logs,
--     trigger ini otomatis update tabel machines yang punya device_id sama.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_machine_from_hml()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.machines
  SET
    hm_seconds   = NEW.hm_seconds,
    current_hm   = ROUND(NEW.hm_seconds / 3600.0, 1),
    status       = NEW.status,
    -- Hitung sisa jam menuju service (jika service_interval diset)
    hours_to_service = CASE
      WHEN service_interval IS NOT NULL AND service_interval > 0
        THEN GREATEST(
          service_interval - (ROUND(NEW.hm_seconds / 3600.0, 1) % service_interval),
          0
        )
      ELSE hours_to_service
    END
  WHERE device_id = NEW.machine_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_machine_from_hml ON public.hour_meter_logs;
CREATE TRIGGER trg_sync_machine_from_hml
  AFTER INSERT ON public.hour_meter_logs
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_machine_from_hml();

COMMENT ON FUNCTION public.fn_sync_machine_from_hml IS
  'Saat ESP32 POST ke hour_meter_logs, otomatis update machines.current_hm dan status';


-- =================================================================
-- BAGIAN 8: RPC FUNCTIONS (dipanggil dari web app)
-- =================================================================

-- -----------------------------------------------------------------
-- 8.1 LOGIN — Verifikasi password bcrypt + fallback plain text
--     Mendukung akun lama (plain text) dengan auto-upgrade ke bcrypt
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_user_password(
  p_email    TEXT,
  p_password TEXT
) RETURNS SETOF public.app_users
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user public.app_users;
BEGIN
  SELECT * INTO v_user
    FROM public.app_users
    WHERE email = p_email;

  IF NOT FOUND THEN RETURN; END IF;

  IF v_user.password_hash LIKE '$2%' THEN
    -- Hash bcrypt → verifikasi normal
    IF crypt(p_password, v_user.password_hash) = v_user.password_hash THEN
      -- Update last_active_at
      UPDATE public.app_users SET last_active_at = NOW() WHERE id = v_user.id;
      RETURN NEXT v_user;
    END IF;
  ELSE
    -- Plain text lama → cek langsung, lalu upgrade ke bcrypt
    IF v_user.password_hash = p_password THEN
      UPDATE public.app_users
        SET password_hash  = crypt(p_password, gen_salt('bf')),
            last_active_at = NOW()
        WHERE id = v_user.id;
      RETURN NEXT v_user;
    END IF;
  END IF;
END;
$$;


-- -----------------------------------------------------------------
-- 8.2 BUAT USER BARU dengan bcrypt
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_app_user(
  p_name             TEXT,
  p_email            TEXT,
  p_role             TEXT,
  p_status           TEXT,
  p_business_unit_id UUID,
  p_password         TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.app_users (
    name, email, password_hash, role, status, business_unit_id
  ) VALUES (
    p_name,
    p_email,
    crypt(p_password, gen_salt('bf')),
    p_role,
    p_status,
    p_business_unit_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- -----------------------------------------------------------------
-- 8.3 UPDATE PASSWORD
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_user_password(
  p_user_id      UUID,
  p_new_password TEXT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.app_users
    SET password_hash = crypt(p_new_password, gen_salt('bf'))
    WHERE id = p_user_id;
END;
$$;


-- -----------------------------------------------------------------
-- 8.4 STATUS TERBARU PER MESIN dari hour_meter_logs
--     Dipanggil di Dashboard untuk live status fleet
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_latest_hm_per_machine()
RETURNS TABLE (
  machine_id   TEXT,
  hm_seconds   BIGINT,
  hm_hours     NUMERIC,
  status       TEXT,
  last_seen_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT ON (machine_id)
    machine_id,
    hm_seconds,
    hm_hours,
    status,
    created_at AS last_seen_at
  FROM public.hour_meter_logs
  ORDER BY machine_id, created_at DESC;
$$;


-- -----------------------------------------------------------------
-- 8.5 CHART MINGGUAN jam operasi per device
--     Dipanggil di halaman Machines > grafik
--     p_machine_id = device_id ESP32, contoh: 'machine_1'
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_weekly_hm_chart(p_machine_id TEXT)
RETURNS TABLE (
  day_label TEXT,
  op_hours  NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH week_days AS (
    SELECT generate_series(
      date_trunc('week', NOW()),
      date_trunc('week', NOW()) + INTERVAL '6 days',
      INTERVAL '1 day'
    )::DATE AS day
  ),
  daily AS (
    SELECT
      DATE(created_at) AS day,
      ROUND((MAX(hm_hours) - MIN(hm_hours))::NUMERIC, 2) AS op_hours
    FROM public.hour_meter_logs
    WHERE machine_id = p_machine_id
      AND created_at >= date_trunc('week', NOW())
      AND created_at <  date_trunc('week', NOW()) + INTERVAL '7 days'
    GROUP BY DATE(created_at)
  )
  SELECT
    TO_CHAR(w.day, 'DY') AS day_label,
    COALESCE(GREATEST(d.op_hours, 0), 0) AS op_hours
  FROM week_days w
  LEFT JOIN daily d ON d.day = w.day
  ORDER BY w.day;
$$;


-- -----------------------------------------------------------------
-- 8.6 MQTT BRIDGE — Update machines dari broker MQTT
--     Dipanggil oleh MQTT bridge server (bukan ESP32 langsung)
--     setiap menerima pesan dari topik factory/machine1/hm/data
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_machine_mqtt(
  p_machine_code   TEXT,
  p_hm_sec         NUMERIC,
  p_prev_hm_sec    NUMERIC,
  p_engine_running BOOLEAN,
  p_client_id      TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_device_id TEXT;
  v_status    TEXT := CASE WHEN p_engine_running THEN 'RUNNING' ELSE 'STOPPED' END;
BEGIN
  UPDATE public.machines
  SET
    hm_seconds   = p_hm_sec::BIGINT,
    current_hm   = ROUND((p_hm_sec / 3600.0)::NUMERIC, 1),
    previous_hm  = ROUND((p_prev_hm_sec / 3600.0)::NUMERIC, 1),
    status       = v_status,
    last_mqtt_at = NOW()
  WHERE machine_code = p_machine_code
  RETURNING device_id INTO v_device_id;

  -- Insert ke hour_meter_logs agar history tersimpan dari jalur MQTT juga
  INSERT INTO public.hour_meter_logs (
    machine_id, hm_seconds, hm_hours, status, timestamp_device
  ) VALUES (
    COALESCE(v_device_id, p_machine_code),
    p_hm_sec::BIGINT,
    ROUND((p_hm_sec / 3600.0)::NUMERIC, 2),
    v_status,
    TO_CHAR(NOW() AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
  );
END;
$$;


-- =================================================================
-- BAGIAN 9: ROW LEVEL SECURITY
-- =================================================================

ALTER TABLE public.business_units    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hour_meter_logs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports           ENABLE ROW LEVEL SECURITY;

-- Izinkan anon key membaca & menulis (web app pakai anon key)
-- Sesuaikan policy ini dengan kebutuhan keamanan produksi
CREATE POLICY "anon_all" ON public.business_units    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.machines          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.hour_meter_logs   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.app_users         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.shifts            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.telemetry_logs    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.service_records   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.service_schedules FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all" ON public.reports           FOR ALL TO anon USING (true) WITH CHECK (true);


-- =================================================================
-- BAGIAN 10: DATA AWAL (SEED)
-- =================================================================

-- Business unit contoh
INSERT INTO public.business_units (name, location, status)
VALUES
  ('GGF Mining Division',  'Kalimantan Timur', 'Active'),
  ('GGF Heavy Equipment',  'Sumatera Selatan', 'Active')
ON CONFLICT DO NOTHING;

-- Admin default — password: Admin@1234
INSERT INTO public.app_users (name, email, password_hash, role, status)
VALUES (
  'System Administrator',
  'admin@ggf.com',
  crypt('Admin@1234', gen_salt('bf')),
  'Fleet Overseer',
  'Online'
)
ON CONFLICT (email) DO NOTHING;


-- =================================================================
-- RINGKASAN RELASI
-- =================================================================
--
--  business_units (1)──────┬──────(N) machines
--                          │              │
--                          │              ├──(N) hour_meter_logs  ← ESP32 REST POST
--                          │              │      [machine_id TEXT = device_id]
--                          │              │
--                          │              ├──(N) shifts
--                          │              ├──(N) telemetry_logs
--                          │              ├──(N) service_records
--                          │              └──(N) service_schedules
--                          │
--                    (N) app_users ────────────(N) shifts.operator_id
--                                └────────────(N) reports.created_by
--
--  ALUR DATA ESP32:
--    ESP32 ──REST POST──► hour_meter_logs
--                              └──TRIGGER──► UPDATE machines (current_hm, status)
--
--    ESP32 ──MQTT──► Broker ──► MQTT Bridge Server
--                                    └──RPC──► upsert_machine_mqtt()
--                                                  ├── UPDATE machines
--                                                  └── INSERT hour_meter_logs
--
-- =================================================================
