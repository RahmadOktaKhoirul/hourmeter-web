import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Icons } from '../lib/icons';
import { cn } from '../lib/utils';
import { supabase, getWeeklyHMChart, subscribeHourMeter, type Machine, type Shift, type TelemetryLog, type BusinessUnit, type HourMeterLog } from '../lib/supabase';
import Modal, { Field, inputCls, selectCls } from '../components/Modal';

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// Bangun 7 hari (Senin s/d Minggu minggu ini)
function buildWeekDays(): { date: Date; label: string; key: string }[] {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return { date: d, label: DAY_LABELS[i], key: `${yyyy}-${mm}-${dd}` };
  });
}

// Komponen toast error sederhana
function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-3 p-4 bg-error/10 border border-error/20 rounded-2xl text-sm text-error font-medium">
      <Icons.AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="text-error/60 hover:text-error transition-colors">
        <Icons.ChevronRight className="w-4 h-4 rotate-45" />
      </button>
    </div>
  );
}

export default function Machines() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selected, setSelected] = useState<Machine | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [logs, setLogs] = useState<TelemetryLog[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<{ name: string; hours: number; active: boolean }[]>([]);

  const [showService, setShowService] = useState(false);
  const [showShift, setShowShift] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [serviceForm, setServiceForm] = useState({ performed_by: '', notes: '', next_service_hm: '' });
  const [shiftForm, setShiftForm] = useState({ operator_name: '', hm_start: '', hm_end: '' });
  const [editForm, setEditForm] = useState<Partial<Machine & { unit_type: Machine['unit_type'] }>>({});

  async function loadMachines() {
    const { data, error: err } = await supabase
      .from('machines')
      .select('*, business_units(id, name, location)')
      .order('created_at');
    if (err) {
      setError(`Gagal memuat data mesin: ${err.message}`);
      setLoading(false);
      return;
    }
    if (data) {
      setMachines(data);
      setSelected(prev => prev ? (data.find(m => m.id === prev.id) ?? data[0]) : data[0]);
    }
    setLoading(false);
  }

  // Load chart mingguan dari hour_meter_logs via RPC (jika device_id ada)
  // Fallback ke shifts jika device_id belum dikonfigurasi
  const loadChart = useCallback(async (machine: Machine) => {
    const todayKey = new Date().toISOString().slice(0, 10);

    // Gunakan hour_meter_logs jika mesin punya device_id
    if (machine.device_id) {
      const data = await getWeeklyHMChart(machine.device_id);
      if (data.length > 0) {
        setChartData(data.map(d => ({
          name: d.name,
          hours: d.hours,
          active: new Date().toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() === d.name,
        })));
        return;
      }
    }

    // Fallback: pakai shifts
    const weekDays = buildWeekDays();
    const from = weekDays[0].key;
    const to   = weekDays[6].key;

    const { data: shiftsData } = await supabase
      .from('shifts')
      .select('started_at, hours_logged')
      .eq('machine_id', machine.id)
      .gte('started_at', from + 'T00:00:00')
      .lte('started_at', to + 'T23:59:59')
      .not('hours_logged', 'is', null);

    const byDate: Record<string, number> = {};
    (shiftsData ?? []).forEach((s: { started_at: string; hours_logged: number }) => {
      const key = s.started_at.slice(0, 10);
      byDate[key] = (byDate[key] ?? 0) + Number(s.hours_logged);
    });

    setChartData(weekDays.map(d => ({
      name: d.label,
      hours: Math.round((byDate[d.key] ?? 0) * 10) / 10,
      active: d.key === todayKey,
    })));
  }, []);

  useEffect(() => {
    loadMachines();
    supabase.from('business_units').select('*').order('name').then(({ data }) => {
      if (data) setBusinessUnits(data);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    // Load shifts, logs, dan chart saat mesin dipilih berubah
    Promise.all([
      supabase.from('shifts').select('*').eq('machine_id', selected.id).order('started_at', { ascending: false }).limit(4),
      supabase.from('telemetry_logs').select('*').eq('machine_id', selected.id).order('created_at', { ascending: false }).limit(20),
    ]).then(([{ data: s, error: se }, { data: l, error: le }]) => {
      if (se) setError(`Gagal memuat shift: ${se.message}`);
      else if (s) setShifts(s);
      if (le) setError(`Gagal memuat log: ${le.message}`);
      else if (l) setLogs(l);
    });
    loadChart(selected);

    // Realtime: update status & HM dari hour_meter_logs jika device_id cocok
    if (!selected.device_id) return;
    const hmSub = subscribeHourMeter((log: HourMeterLog) => {
      if (log.machine_id !== selected.device_id) return;
      setSelected(prev => prev ? {
        ...prev,
        current_hm: log.hm_hours,
        hm_seconds: log.hm_seconds,
        status: log.status === 'RUNNING' ? 'RUNNING' : 'STOPPED',
        last_mqtt_at: log.created_at,
      } : prev);
    });
    return () => { hmSub.unsubscribe(); };
  }, [selected?.id, loadChart]);

  async function handleScheduleService(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const nextHm = serviceForm.next_service_hm
        ? parseFloat(serviceForm.next_service_hm)
        : selected.current_hm + (selected.service_interval ?? 500);

      const [{ error: srErr }, { error: mErr }, { error: logErr }] = await Promise.all([
        supabase.from('service_records').insert({
          machine_id: selected.id,
          performed_by: serviceForm.performed_by,
          hm_at_service: selected.current_hm,
          notes: serviceForm.notes || null,
          next_service_hm: nextHm,
        }),
        supabase.from('machines').update({
          service_status: 'SCHEDULED',
          hours_to_service: nextHm - selected.current_hm,
        }).eq('id', selected.id),
        supabase.from('telemetry_logs').insert({
          machine_id: selected.id,
          event_type: 'SERVICE',
          title: `Service Scheduled by ${serviceForm.performed_by}`,
          description: serviceForm.notes || null,
        }),
      ]);

      const firstError = srErr ?? mErr ?? logErr;
      if (firstError) {
        setError(`Gagal menjadwalkan service: ${firstError.message}`);
        return;
      }

      setShowService(false);
      setServiceForm({ performed_by: '', notes: '', next_service_hm: '' });
      await loadMachines();
    } finally {
      setSaving(false);
    }
  }

  async function handleAddShift(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const [{ error: shiftErr }, { error: logErr }] = await Promise.all([
        supabase.from('shifts').insert({
          machine_id: selected.id,
          operator_name: shiftForm.operator_name,
          hm_start: parseFloat(shiftForm.hm_start),
          hm_end: shiftForm.hm_end ? parseFloat(shiftForm.hm_end) : null,
          started_at: new Date().toISOString(),
        }),
        supabase.from('telemetry_logs').insert({
          machine_id: selected.id,
          event_type: 'OPERATOR_SWAP',
          title: `Shift logged: ${shiftForm.operator_name}`,
          description: `HM ${shiftForm.hm_start} → ${shiftForm.hm_end || 'ongoing'}`,
        }),
      ]);

      const firstError = shiftErr ?? logErr;
      if (firstError) {
        setError(`Gagal menyimpan shift: ${firstError.message}`);
        return;
      }

      setShowShift(false);
      setShiftForm({ operator_name: '', hm_start: '', hm_end: '' });
      await loadMachines();
    } finally {
      setSaving(false);
    }
  }

  async function handleEditMachine(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('machines')
        .update(editForm)
        .eq('id', selected.id);

      if (err) {
        setError(`Gagal menyimpan perubahan: ${err.message}`);
        return;
      }

      setShowEdit(false);
      await loadMachines();
    } finally {
      setSaving(false);
    }
  }

  function generateReport() {
    if (!selected) return;
    const rows = [
      ['Field', 'Value'],
      ['Machine Code', selected.machine_code],
      ['Unit Name', selected.unit_name],
      ['Serial Number', selected.serial_number ?? ''],
      ['Status', selected.status],
      ['Service Status', selected.service_status],
      ['Current HM', String(selected.current_hm)],
      ['Previous HM', String(selected.previous_hm)],
      ['Hours to Service', String(selected.hours_to_service ?? '')],
      ['Business Unit', selected.business_units?.name ?? ''],
      ['Generated At', new Date().toLocaleString()],
    ];
    const csv = rows.map(r => r.map(f => `"${f}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${selected.machine_code}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-on-surface-variant text-sm">
      Loading machines...
    </div>
  );

  if (!selected) return (
    <div className="flex items-center justify-center h-64 text-on-surface-variant text-sm">
      No machines found.
    </div>
  );

  const serviceProgress = selected.service_interval
    ? Math.round(((selected.service_interval - (selected.hours_to_service ?? 0)) / selected.service_interval) * 100)
    : 0;

  const metrics = [
    { label: 'HM Saat Ini', value: selected.current_hm.toLocaleString(), unit: 'h', sub: `+${(selected.current_hm - selected.previous_hm).toFixed(1)}h hari ini`, icon: Icons.TrendingUp, color: 'text-primary', iconBg: 'bg-primary/10' },
    { label: 'HM Sebelumnya', value: selected.previous_hm.toLocaleString(), unit: 'h', sub: 'Pembacaan sebelumnya', icon: Icons.Timer, color: 'text-on-surface-variant', iconBg: 'bg-surface-container-highest' },
    { label: 'Delta 24 Jam', value: (selected.current_hm - selected.previous_hm).toFixed(1), unit: 'h', sub: 'Kenaikan harian', icon: Icons.Activity, color: 'text-tertiary', iconBg: 'bg-tertiary/10' },
    { label: 'Sisa Menuju Service', value: String(selected.hours_to_service ?? 0), unit: 'h', sub: `${serviceProgress}% interval terpakai`, icon: Icons.Wrench, color: 'text-error', iconBg: 'bg-error/10', progress: serviceProgress },
  ];

  const totalWeeklyHours = chartData.reduce((s, d) => s + d.hours, 0);

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      {/* Machine selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {machines.map((m) => (
          <button key={m.id} onClick={() => setSelected(m)}
            className={cn('px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
              selected.id === m.id
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
            )}>
            {m.machine_code}
          </button>
        ))}
      </div>

      {/* Hero Header */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className={cn('w-2 h-2 rounded-full',
              selected.status === 'RUNNING' ? 'bg-primary animate-pulse' : 'bg-on-surface-variant/40'
            )} />
            <span className={cn('text-xs font-medium',
              selected.status === 'RUNNING' ? 'text-primary' : 'text-on-surface-variant'
            )}>
              {selected.status === 'RUNNING' ? 'Beroperasi' : selected.status === 'STOPPED' ? 'Berhenti' : 'Maintenance'}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-on-surface">{selected.machine_code}</h2>
          <p className="text-sm text-on-surface-variant">
            {selected.unit_name} · S/N {selected.serial_number ?? '—'} · {selected.business_units?.name ?? '—'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              setEditForm({
                machine_code: selected.machine_code,
                unit_name: selected.unit_name,
                unit_type: selected.unit_type,
                serial_number: selected.serial_number ?? '',
                status: selected.status,
                service_status: selected.service_status,
                current_hm: selected.current_hm,
                previous_hm: selected.previous_hm,
                hours_to_service: selected.hours_to_service ?? 500,
                business_unit_id: selected.business_unit_id ?? '',
                device_id: selected.device_id ?? '',
              });
              setShowEdit(true);
            }}
            className="px-4 py-2 bg-surface-container-high text-on-surface text-sm font-medium rounded-lg hover:bg-surface-container-highest transition-colors flex items-center gap-1.5"
          >
            <Icons.Settings className="w-4 h-4" /> Edit
          </button>
          <button onClick={generateReport}
            className="px-4 py-2 bg-surface-container-high text-on-surface text-sm font-medium rounded-lg hover:bg-surface-container-highest transition-colors flex items-center gap-1.5">
            <Icons.Download className="w-4 h-4" /> Laporan
          </button>
          <button
            onClick={() => { setServiceForm({ performed_by: '', notes: '', next_service_hm: '' }); setShowService(true); }}
            className="px-4 py-2 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5"
          >
            <Icons.Wrench className="w-4 h-4" /> Jadwalkan Service
          </button>
        </div>
      </section>

      {/* Metrics */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, i) => (
          <motion.div key={metric.label}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/10 hover:border-outline-variant/30 hover:shadow-sm transition-all">
            <div className="flex items-start justify-between mb-4">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', metric.iconBg)}>
                <metric.icon className={cn('w-5 h-5', metric.color)} />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className={cn('text-3xl font-bold tracking-tight', metric.color)}>{metric.value}</span>
              <span className="text-sm text-on-surface-variant">{metric.unit}</span>
            </div>
            <p className="text-sm font-medium text-on-surface mt-1">{metric.label}</p>
            <div className="mt-2">
              {metric.progress !== undefined ? (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-on-surface-variant">
                    <span>{metric.sub}</span>
                    <span className={metric.progress >= 90 ? 'text-error font-medium' : ''}>{metric.progress >= 90 ? 'Kritis' : 'Normal'}</span>
                  </div>
                  <div className="w-full bg-surface-container-highest h-1.5 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-700', metric.progress >= 90 ? 'bg-error' : 'bg-tertiary')}
                      style={{ width: `${metric.progress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-on-surface-variant">{metric.sub}</p>
              )}
            </div>
          </motion.div>
        ))}
      </section>

      {/* Chart + Shifts */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-surface-container-low rounded-xl border border-outline-variant/10 p-6 flex flex-col gap-5">
          <div>
            <h3 className="font-semibold text-base text-on-surface">Jam Operasi Mingguan</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {selected.machine_code} · {totalWeeklyHours.toFixed(1)} jam minggu ini
            </p>
          </div>
          <div className="h-80 w-full">
            {totalWeeklyHours === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-on-surface-variant">
                <Icons.Activity className="w-10 h-10 opacity-20" />
                <p className="text-sm font-medium">No operation data this week</p>
                <p className="text-xs opacity-60">Data akan muncul saat shift direkam</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: 'var(--c-on-surface-variant)', fontSize: 10, fontWeight: 700 }}
                    dy={10}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(84,224,131,0.05)' }}
                    contentStyle={{ backgroundColor: 'var(--c-surface-container-high)', border: 'none', borderRadius: '12px', color: 'var(--c-on-surface)' }}
                    labelStyle={{ fontWeight: 700 }}
                    formatter={(v) => [`${v ?? 0} h`, 'Operation']}
                  />
                  <Bar dataKey="hours" radius={[8, 8, 0, 0]} barSize={60}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.active ? 'var(--c-primary)' : 'var(--c-surface-container-highest)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 bg-surface-container-low rounded-xl border border-outline-variant/10 p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-base text-on-surface">Shift Terkini</h3>
            <button
              onClick={() => { setShiftForm({ operator_name: '', hm_start: String(selected.current_hm), hm_end: '' }); setShowShift(true); }}
              className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-all"
            >
              <Icons.Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-col gap-2 flex-1">
            {shifts.length === 0
              ? <p className="text-sm text-on-surface-variant">Belum ada shift.</p>
              : shifts.map((shift, i) => (
                  <div key={shift.id} className={cn(
                    'grid grid-cols-2 py-3 px-4 rounded-lg transition-all',
                    i === 0 ? 'bg-primary/10 border border-primary/20' : 'bg-surface-container-highest/30'
                  )}>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-on-surface-variant">Operator</span>
                      <span className="text-sm font-medium text-on-surface">{shift.operator_name}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-xs text-on-surface-variant">Jam</span>
                      <span className={cn('text-sm font-semibold', i === 0 ? 'text-primary' : 'text-on-surface')}>
                        {shift.hours_logged != null ? `${shift.hours_logged}h` : 'Aktif'}
                      </span>
                    </div>
                  </div>
                ))}
          </div>
        </div>
      </section>

      {/* Event Log */}
      <section className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/10 flex justify-between items-center">
          <h3 className="font-semibold text-base text-on-surface">Log Event</h3>
          <span className="text-xs text-on-surface-variant">{logs.length} event</span>
        </div>
        <div className="divide-y divide-outline-variant/5 max-h-96 overflow-y-auto">
          {logs.length === 0
            ? <p className="px-6 py-5 text-sm text-on-surface-variant">Belum ada event.</p>
            : logs.map((log) => (
                <div key={log.id} className="px-6 py-4 flex items-center gap-4 hover:bg-surface-container-high/30 transition-colors">
                  <span className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded-md shrink-0',
                    log.event_type === 'ALERT'   ? 'bg-error/10 text-error' :
                    log.event_type === 'RESET'   ? 'bg-error/10 text-error' :
                    log.event_type === 'SERVICE' ? 'bg-primary/10 text-primary' :
                    log.event_type === 'START'   ? 'bg-primary/10 text-primary' :
                    log.event_type === 'BOOT'    ? 'bg-primary/10 text-primary' :
                    log.event_type === 'ADJUST'  ? 'bg-tertiary/10 text-tertiary' :
                    'bg-surface-container-highest text-on-surface-variant'
                  )}>{log.event_type}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">{log.title}</p>
                    {log.description && <p className="text-xs text-on-surface-variant mt-0.5 truncate">{log.description}</p>}
                  </div>
                  <span className="text-xs text-on-surface-variant shrink-0">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              ))}
        </div>
      </section>

      {/* Schedule Service Modal */}
      <Modal open={showService} onClose={() => setShowService(false)} title={`Schedule Service — ${selected.machine_code}`}>
        <form onSubmit={handleScheduleService} className="space-y-4">
          <div className="p-4 bg-surface-container-high rounded-lg text-sm text-on-surface-variant">
            Current HM: <span className="font-bold text-on-surface">{selected.current_hm}h</span> &nbsp;|&nbsp;
            Service Status: <span className={cn('font-bold', selected.service_status === 'OK' ? 'text-primary' : 'text-error')}>{selected.service_status}</span>
          </div>
          <Field label="Performed By">
            <input required className={inputCls} placeholder="Technician name" value={serviceForm.performed_by}
              onChange={e => setServiceForm(f => ({ ...f, performed_by: e.target.value }))} />
          </Field>
          <Field label="Next Service at HM (h)">
            <input type="number" step="0.1" className={inputCls}
              placeholder={String(selected.current_hm + (selected.service_interval ?? 500))}
              value={serviceForm.next_service_hm}
              onChange={e => setServiceForm(f => ({ ...f, next_service_hm: e.target.value }))} />
          </Field>
          <Field label="Notes">
            <textarea className={inputCls + ' resize-none'} rows={3} placeholder="Service notes..."
              value={serviceForm.notes}
              onChange={e => setServiceForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowService(false)}
              className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">
              Batal
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-60 transition-opacity">
              {saving ? 'Menyimpan...' : 'Jadwalkan Service'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Shift Modal */}
      <Modal open={showShift} onClose={() => setShowShift(false)} title={`Log Shift — ${selected.machine_code}`}>
        <form onSubmit={handleAddShift} className="space-y-4">
          <Field label="Operator Name">
            <input required className={inputCls} placeholder="Operator name" value={shiftForm.operator_name}
              onChange={e => setShiftForm(f => ({ ...f, operator_name: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="HM Start (h)">
              <input required type="number" step="0.1" className={inputCls} value={shiftForm.hm_start}
                onChange={e => setShiftForm(f => ({ ...f, hm_start: e.target.value }))} />
            </Field>
            <Field label="HM End (h) — optional">
              <input type="number" step="0.1" className={inputCls} placeholder="Leave blank if active"
                value={shiftForm.hm_end}
                onChange={e => setShiftForm(f => ({ ...f, hm_end: e.target.value }))} />
            </Field>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowShift(false)}
              className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">
              Batal
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-60 transition-opacity">
              {saving ? 'Menyimpan...' : 'Simpan Shift'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Unit Modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title={`Edit Unit — ${selected.machine_code}`}>
        <form onSubmit={handleEditMachine} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Kode Unit">
              <input required className={inputCls} value={editForm.machine_code ?? ''}
                onChange={e => setEditForm(f => ({ ...f, machine_code: e.target.value }))} />
            </Field>
            <Field label="Nama Unit">
              <input required className={inputCls} value={editForm.unit_name ?? ''}
                onChange={e => setEditForm(f => ({ ...f, unit_name: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tipe Unit">
              <select className={inputCls} value={editForm.unit_type ?? ''}
                onChange={e => setEditForm(f => ({ ...f, unit_type: e.target.value as Machine['unit_type'] }))}>
                <option value="">— Pilih Tipe —</option>
                <option value="BSC">BSC</option>
                <option value="BDF">BDF</option>
              </select>
            </Field>
            <Field label="Business Unit">
              <select className={selectCls} value={editForm.business_unit_id ?? ''}
                onChange={e => setEditForm(f => ({ ...f, business_unit_id: e.target.value || null }))}>
                <option value="">— None —</option>
                {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <select className={selectCls} value={editForm.status ?? 'STOPPED'}
                onChange={e => setEditForm(f => ({ ...f, status: e.target.value as Machine['status'] }))}>
                <option>RUNNING</option><option>STOPPED</option><option>MAINTENANCE</option>
              </select>
            </Field>
            <Field label="Service Status">
              <select className={selectCls} value={editForm.service_status ?? 'OK'}
                onChange={e => setEditForm(f => ({ ...f, service_status: e.target.value as Machine['service_status'] }))}>
                <option>OK</option><option>OVERDUE</option><option>SCHEDULED</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Current HM (h)">
              <input type="number" step="0.1" className={inputCls} value={editForm.current_hm ?? 0}
                onChange={e => setEditForm(f => ({ ...f, current_hm: parseFloat(e.target.value) }))} />
            </Field>
            <Field label="Hours to Service (h)">
              <input type="number" step="0.1" className={inputCls} value={editForm.hours_to_service ?? 500}
                onChange={e => setEditForm(f => ({ ...f, hours_to_service: parseFloat(e.target.value) }))} />
            </Field>
          </div>
          <Field label="Device ID (dari hour_meter_logs)">
            <input className={inputCls} placeholder="machine_1"
              value={editForm.device_id ?? ''}
              onChange={e => setEditForm(f => ({ ...f, device_id: e.target.value || null }))} />
            <p className="text-xs text-on-surface-variant mt-1">
              Isi sesuai nilai machine_id di tabel hour_meter_logs (contoh: machine_1)
            </p>
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowEdit(false)}
              className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">
              Batal
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-60 transition-opacity">
              {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
