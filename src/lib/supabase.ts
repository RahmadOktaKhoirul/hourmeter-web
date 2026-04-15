import { createClient } from '@supabase/supabase-js';

declare global {
  interface ImportMeta {
    env: Record<string, string>;
  }
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── Types ──────────────────────────────────────────────────

export type BusinessUnit = {
  id: string;
  name: string;
  location: string;
  status: 'Active' | 'Maintenance' | 'Inactive';
  created_at: string;
  machines?: Machine[];
};

export type Machine = {
  id: string;
  machine_code: string;
  unit_name: string;
  unit_type: 'BSC' | 'BDF' | null;   // tipe unit alat berat
  serial_number: string | null;
  tier: string | null;
  business_unit_id: string | null;
  device_id: string | null;           // mapping ke hour_meter_logs.machine_id
  status: 'RUNNING' | 'STOPPED' | 'MAINTENANCE';
  service_status: 'OK' | 'OVERDUE' | 'SCHEDULED';
  current_hm: number;
  previous_hm: number;
  hours_to_service: number | null;
  service_interval: number | null;
  created_at: string;
  hm_seconds?: number;
  last_mqtt_at?: string | null;
  business_units?: Pick<BusinessUnit, 'id' | 'name' | 'location'>;
};

// Data log dari IoT device (tabel hour_meter_logs)
export type HourMeterLog = {
  id: number;
  created_at: string;
  machine_id: string;       // teks seperti "machine_1"
  hm_seconds: number;
  hm_hours: number;
  status: 'RUNNING' | 'STOPPED';
  timestamp_device: string;
};

// Row hasil get_latest_hm_per_machine()
export type LatestHM = {
  machine_id: string;
  hm_seconds: number;
  hm_hours: number;
  status: 'RUNNING' | 'STOPPED';
  last_seen_at: string;
};

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: 'Fleet Overseer' | 'Unit Manager' | 'Maintenance Lead' | 'Operator';
  status: 'Online' | 'Offline' | 'Away';
  avatar_url: string | null;
  business_unit_id: string | null;
  last_active_at: string | null;
  created_at: string;
  business_units?: Pick<BusinessUnit, 'id' | 'name'>;
};

export type Shift = {
  id: string;
  machine_id: string;
  operator_id: string | null;
  operator_name: string;
  hm_start: number;
  hm_end: number | null;
  hours_logged: number | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
};

export type TelemetryLog = {
  id: string;
  machine_id: string;
  event_type: 'ALERT' | 'START' | 'STOP' | 'OPERATOR_SWAP' | 'SERVICE' | 'INFO' | 'RESET' | 'ADJUST' | 'BOOT';
  title: string;
  description: string | null;
  created_at: string;
  machines?: Pick<Machine, 'id' | 'machine_code' | 'unit_name'>;
};

export type ServiceRecord = {
  id: string;
  machine_id: string;
  performed_by: string;
  hm_at_service: number;
  notes: string | null;
  next_service_hm: number | null;
  serviced_at: string;
  created_at: string;
};

export type Report = {
  id: string;
  title: string;
  type: 'Analytics' | 'Compliance' | 'Forecast' | 'Operational';
  file_url: string | null;
  file_size: string | null;
  business_unit_id: string | null;
  created_by: string | null;
  created_at: string;
  business_units?: Pick<BusinessUnit, 'id' | 'name'>;
};

// Tersedia setelah migration_mqtt.sql dijalankan
export type DailyOperation = {
  id: string;
  machine_id: string;
  date: string;
  hours: number;
  created_at: string;
  updated_at: string;
};

export type WeeklyChartRow = {
  day_name: string;
  op_hours: number;
  idle_hours: number;
};

// ── Helper: format HM seconds → "1,240.5 h" ──────────────
export function formatHM(seconds: number): string {
  return (seconds / 3600).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// ── Helper: service progress % ────────────────────────────
export function serviceProgress(machine: Machine): number {
  if (!machine.service_interval || machine.service_interval === 0) return 0;
  const used = machine.service_interval - (machine.hours_to_service ?? machine.service_interval);
  return Math.min(Math.round((used / machine.service_interval) * 100), 100);
}

// ── Realtime: subscribe ke perubahan machines ─────────────
export function subscribeMachines(onUpdate: (machine: Machine) => void) {
  return supabase
    .channel('machines-realtime')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'machines' },
      (payload) => onUpdate(payload.new as Machine)
    )
    .subscribe();
}

// ── Realtime: subscribe ke telemetry_logs baru ────────────
export function subscribeLogs(onInsert: (log: TelemetryLog) => void) {
  return supabase
    .channel('logs-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'telemetry_logs' },
      (payload) => onInsert(payload.new as TelemetryLog)
    )
    .subscribe();
}

// ── Realtime: subscribe ke hour_meter_logs baru ───────────
export function subscribeHourMeter(onInsert: (log: HourMeterLog) => void) {
  return supabase
    .channel('hour-meter-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'hour_meter_logs' },
      (payload) => onInsert(payload.new as HourMeterLog)
    )
    .subscribe();
}

// ── Ambil status terbaru per mesin dari hour_meter_logs ───
export async function getLatestHMPerMachine(): Promise<LatestHM[]> {
  const { data } = await supabase.rpc('get_latest_hm_per_machine');
  return (data ?? []) as LatestHM[];
}

// ── Ambil data chart mingguan dari hour_meter_logs ────────
export async function getWeeklyHMChart(deviceId: string): Promise<{ name: string; hours: number }[]> {
  const { data } = await supabase.rpc('get_weekly_hm_chart', { p_machine_id: deviceId });
  return (data ?? []).map((r: { day_label: string; op_hours: number }) => ({
    name: r.day_label,
    hours: Number(r.op_hours),
  }));
}
