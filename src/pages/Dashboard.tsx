import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'motion/react';
import { Icons } from '../lib/icons';
import { cn } from '../lib/utils';
import {
  supabase, subscribeMachines, subscribeLogs, subscribeHourMeter, getLatestHMPerMachine,
  type Machine, type TelemetryLog, type BusinessUnit, type LatestHM,
} from '../lib/supabase';
import Modal, { Field, inputCls, selectCls } from '../components/Modal';

const DAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const eventIconMap: Record<TelemetryLog['event_type'], { icon: React.ElementType; color: string; bgColor: string }> = {
  ALERT:         { icon: Icons.AlertTriangle, color: 'text-error',              bgColor: 'bg-error/10' },
  START:         { icon: Icons.Zap,           color: 'text-primary',            bgColor: 'bg-primary/10' },
  STOP:          { icon: Icons.Activity,      color: 'text-on-surface-variant', bgColor: 'bg-surface-container-highest' },
  OPERATOR_SWAP: { icon: Icons.Users,         color: 'text-on-surface-variant', bgColor: 'bg-surface-container-highest' },
  SERVICE:       { icon: Icons.BadgeCheck,    color: 'text-primary',            bgColor: 'bg-primary/10' },
  INFO:          { icon: Icons.Activity,      color: 'text-on-surface-variant', bgColor: 'bg-surface-container-highest' },
  RESET:         { icon: Icons.Reset,         color: 'text-error',              bgColor: 'bg-error/10' },
  ADJUST:        { icon: Icons.Sliders,       color: 'text-tertiary',           bgColor: 'bg-tertiary/10' },
  BOOT:          { icon: Icons.Power,         color: 'text-primary',            bgColor: 'bg-primary/10' },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Today, ${new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (hrs < 48) return `Yesterday, ${new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return new Date(dateStr).toLocaleDateString();
}

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
    return {
      date: d,
      label: DAY_LABELS[i],
      key: `${yyyy}-${mm}-${dd}`,
    };
  });
}

const emptyMachine = {
  machine_code: '', unit_name: '', unit_type: '' as Machine['unit_type'],
  serial_number: '', tier: '',
  business_unit_id: '', status: 'STOPPED' as Machine['status'], service_status: 'OK' as Machine['service_status'],
  current_hm: 0, previous_hm: 0, hours_to_service: 500, service_interval: 500,
};

// Komponen error banner
function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-3 p-4 bg-error/10 border border-error/20 rounded-2xl text-sm text-error font-medium">
      <Icons.AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="text-error/60 hover:text-error transition-colors ml-2 font-bold">✕</button>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [latestHM, setLatestHM] = useState<Record<string, LatestHM>>({});
  const [events, setEvents] = useState<TelemetryLog[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [chartData, setChartData] = useState<{ name: string; primary: number; idle: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [form, setForm] = useState(emptyMachine);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: m }, { data: e }, { data: bu }] = await Promise.all([
      supabase.from('machines').select('*, business_units(id, name, location)').order('created_at'),
      supabase.from('telemetry_logs').select('*').order('created_at', { ascending: false }).limit(4),
      supabase.from('business_units').select('*').order('name'),
    ]);
    if (m) setMachines(m);
    if (e) setEvents(e);
    if (bu) setBusinessUnits(bu);

    // Ambil status terbaru per mesin dari hour_meter_logs
    const latest = await getLatestHMPerMachine();
    const map: Record<string, LatestHM> = {};
    latest.forEach(l => { map[l.machine_id] = l; });
    setLatestHM(map);

    setLoading(false);
  }, []);

  // Load weekly chart dari daily_operation (jika tabel ada) atau fallback ke shifts
  const loadChart = useCallback(async () => {
    const weekDays = buildWeekDays();
    const from = weekDays[0].key;
    const to   = weekDays[6].key;

    // Ambil data dari shifts
    const { data: shifts, error } = await supabase
      .from('shifts')
      .select('started_at, hours_logged')
      .gte('started_at', from + 'T00:00:00')
      .lte('started_at', to + 'T23:59:59')
      .not('hours_logged', 'is', null);

    if (error) {
      console.error('Error loading shifts for chart:', error.message);
      return;
    }

    const byDate: Record<string, number> = {};
    (shifts ?? []).forEach((s: { started_at: string; hours_logged: number }) => {
      const key = s.started_at.slice(0, 10);
      byDate[key] = (byDate[key] ?? 0) + Number(s.hours_logged);
    });
    setChartData(weekDays.map(d => ({
      name: d.label,
      primary: Math.round((byDate[d.key] ?? 0) * 10) / 10,
      idle: 0,
    })));
  }, []);

  useEffect(() => {
    load();
    loadChart();

    // Realtime: update machine row saat ada perubahan dari MQTT
    const machineSub = subscribeMachines((updated) => {
      setMachines(prev => prev.map(m => m.id === updated.id ? { ...m, ...updated } : m));
    });

    // Realtime: tambah log baru ke feed
    const logSub = subscribeLogs((newLog) => {
      setEvents(prev => [newLog, ...prev].slice(0, 4));
    });

    // Realtime: update status terbaru dari hour_meter_logs
    const hmSub = subscribeHourMeter((log) => {
      setLatestHM(prev => ({ ...prev, [log.machine_id]: {
        machine_id: log.machine_id,
        hm_seconds: log.hm_seconds,
        hm_hours: log.hm_hours,
        status: log.status,
        last_seen_at: log.created_at,
      }}));
    });

    return () => {
      machineSub.unsubscribe();
      logSub.unsubscribe();
      hmSub.unsubscribe();
    };
  }, [load, loadChart]);

  async function handleAddMachine(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { data: newMachine, error: insertErr } = await supabase.from('machines').insert({
        ...form,
        business_unit_id: form.business_unit_id || null,
        serial_number: form.serial_number || null,
      }).select().single();

      if (insertErr) {
        setError(`Gagal menambahkan mesin: ${insertErr.message}`);
        return;
      }

      if (newMachine) {
        // Log ini dijalankan tanpa ditunggu (fire-and-forget)
        supabase.from('telemetry_logs').insert({
          machine_id: newMachine.id,
          event_type: 'INFO',
          title: `Machine ${form.machine_code} added to fleet`,
          description: `Unit: ${form.unit_name}`,
        }).then(({ error: logErr }) => { if (logErr) console.error(logErr); });
      }
      setShowAddMachine(false);
      setForm(emptyMachine);
      await load();
    } finally {
      setSaving(false);
    }
  }

  function exportCSV() {
    const headers = ['Machine ID', 'Unit', 'Business Unit', 'HM (h)', 'Status', 'Service', 'Last MQTT'];
    const rows = machines.map(m => [
      m.machine_code, m.unit_name, m.business_units?.name ?? '',
      m.current_hm,
      m.status, m.service_status,
      m.last_mqtt_at ? new Date(m.last_mqtt_at).toLocaleString() : 'N/A',
    ]);
    // Bungkus dengan tanda kutip agar koma pada tanggal/nama tidak merusak kolom CSV
    const csv = [headers, ...rows].map(r => r.map(field => `"${field}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'fleet-status.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const totalMachines = machines.length;
  const totalHM = machines.reduce((s, m) => s + Number(m.current_hm), 0);
  const dueForService = machines.filter(m => m.service_status === 'OVERDUE').length;
  const running = machines.filter(m => m.status === 'RUNNING').length;
  const utilization = totalMachines > 0 ? Math.round((running / totalMachines) * 100) : 0;
  const weeklyHours = chartData.reduce((s, d) => s + d.primary, 0);

  const kpis = [
    { label: 'Total Unit', value: String(totalMachines), sub: `${running} beroperasi`, icon: Icons.Machines, color: 'text-primary', iconBg: 'bg-primary/10', onClick: () => navigate('/machines') },
    { label: 'Jam Operasi Minggu Ini', value: weeklyHours >= 1000 ? `${(weeklyHours / 1000).toFixed(1)}k` : weeklyHours.toFixed(1), sub: 'jam minggu ini', icon: Icons.Timer, color: 'text-on-surface', iconBg: 'bg-surface-container-highest' },
    { label: 'Perlu Service', value: String(dueForService), sub: 'unit overdue', icon: Icons.Wrench, color: 'text-error', iconBg: 'bg-error/10', highlight: true, onClick: () => navigate('/machines') },
    { label: 'Utilisasi Fleet', value: `${utilization}%`, sub: utilization >= 90 ? 'Optimal' : 'Normal', icon: Icons.TrendingUp, color: 'text-tertiary', iconBg: 'bg-tertiary/10' },
  ];

  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.label}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className={cn('bg-surface-container-low p-5 rounded-xl border border-outline-variant/10 group hover:border-outline-variant/30 hover:shadow-sm transition-all', kpi.onClick && 'cursor-pointer')}
            onClick={kpi.onClick}
          >
            <div className="flex items-start justify-between mb-4">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', kpi.iconBg)}>
                <kpi.icon className={cn('w-5 h-5', kpi.color)} />
              </div>
              {kpi.onClick && (
                <Icons.ArrowRight className="w-4 h-4 text-on-surface-variant/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              )}
            </div>
            <span className={cn('text-3xl font-bold tracking-tight', kpi.color)}>{kpi.value}</span>
            <p className="text-sm font-medium text-on-surface mt-1">{kpi.label}</p>
            <p className={cn('text-xs mt-0.5', kpi.highlight ? 'text-error' : 'text-on-surface-variant')}>
              {kpi.sub}
            </p>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Weekly Chart */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-8 bg-surface-container-low p-6 rounded-xl border border-outline-variant/10 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-semibold text-base text-on-surface">Jam Operasi Mingguan</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">{weeklyHours.toFixed(1)} jam total minggu ini</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
              <span className="w-2 h-2 rounded-full bg-primary" /> Operasi
            </span>
          </div>
          <div className="flex-1 h-72 w-full">
            {chartData.length === 0 || weeklyHours === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-on-surface-variant">
                <Icons.Activity className="w-8 h-8 opacity-20" />
                <p className="text-sm">Belum ada data operasi minggu ini</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--c-outline-variant)" opacity={0.4} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--c-on-surface-variant)', fontSize: 11 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--c-on-surface-variant)', fontSize: 11 }} unit="h" />
                  <Tooltip
                    cursor={{ fill: 'var(--c-surface-container-high)', radius: 4 }}
                    contentStyle={{ backgroundColor: 'var(--c-surface)', border: '1px solid var(--c-outline-variant)', borderRadius: '8px', color: 'var(--c-on-surface)', fontSize: '13px' }}
                    formatter={(v) => [`${v ?? 0} jam`, 'Operasi']}
                  />
                  <Bar dataKey="primary" fill="var(--c-primary)" radius={[3, 3, 0, 0]} barSize={36} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Recent Events */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="lg:col-span-4 bg-surface-container-low p-6 rounded-xl border border-outline-variant/10 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-base text-on-surface">Event Terkini</h3>
            <span className="flex items-center gap-1.5 text-xs text-on-surface-variant">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Live
            </span>
          </div>
          <div className="space-y-4 flex-1">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-surface-container-high rounded-lg animate-pulse" />)
              : events.length === 0
                ? <p className="text-sm text-on-surface-variant">Belum ada event.</p>
                : events.map((event) => {
                    const meta = eventIconMap[event.event_type] || eventIconMap['INFO'];
                    return (
                      <div key={event.id} className="flex gap-3 group cursor-pointer" onClick={() => navigate('/machines')}>
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', meta.bgColor)}>
                          <meta.icon className={cn('w-4 h-4', meta.color)} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-on-surface group-hover:text-primary transition-colors truncate">{event.title}</p>
                          <p className="text-xs text-on-surface-variant mt-0.5">{timeAgo(event.created_at)}</p>
                        </div>
                      </div>
                    );
                  })}
          </div>
          <button onClick={() => navigate('/machines')} className="mt-4 pt-4 border-t border-outline-variant/10 text-xs text-primary hover:underline text-left flex items-center gap-1.5 group">
            Lihat semua log <Icons.ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </motion.div>

        {/* Fleet Table */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="lg:col-span-12 bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden">
          <div className="px-6 py-4 border-b border-outline-variant/10 flex justify-between items-center">
            <div>
              <h3 className="font-semibold text-base text-on-surface">Status Fleet Aktif</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">Data live via MQTT · diperbarui otomatis</p>
            </div>
            <div className="flex gap-2">
              <button onClick={exportCSV} className="px-3 py-1.5 rounded-lg bg-surface-container-high text-xs font-medium text-on-surface-variant hover:bg-surface-container-highest transition-colors flex items-center gap-1.5">
                <Icons.Download className="w-3.5 h-3.5" /> Export CSV
              </button>
              <button onClick={() => setShowAddMachine(true)} className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1.5">
                <Icons.Plus className="w-3.5 h-3.5" /> Tambah Unit
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs font-medium text-on-surface-variant border-b border-outline-variant/10 bg-surface-container-high/40">
                  <th className="px-6 py-3">Kode Unit</th>
                  <th className="px-6 py-3">Nama Unit</th>
                  <th className="px-6 py-3">Business Unit</th>
                  <th className="px-6 py-3 text-right">HM (Jam)</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-center">Service</th>
                  <th className="px-6 py-3 text-center">Terakhir Update</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={7} className="px-6 py-4"><div className="h-4 bg-surface-container-high rounded animate-pulse" /></td></tr>
                    ))
                  : machines.map((item) => {
                      // Prioritaskan data dari hour_meter_logs jika device_id terhubung
                      const liveData = item.device_id ? latestHM[item.device_id] : null;
                      const displayHM    = liveData ? liveData.hm_hours    : item.current_hm;
                      const displayStatus = liveData ? liveData.status     : item.status;
                      const lastSeen      = liveData ? liveData.last_seen_at : item.last_mqtt_at;
                      const isLive = lastSeen
                        ? (Date.now() - new Date(lastSeen).getTime()) < 120000
                        : false;
                      return (
                        <tr key={item.id} onClick={() => navigate('/machines')} className="hover:bg-surface-container-high/30 transition-colors group cursor-pointer">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-on-surface group-hover:text-primary transition-colors">{item.machine_code}</span>
                              {isLive && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" title="Live" />}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-on-surface-variant">{item.unit_name}</td>
                          <td className="px-6 py-4 text-sm text-on-surface-variant">{item.business_units?.name ?? '—'}</td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-sm font-semibold text-on-surface">
                              {Number(displayHM).toLocaleString('en-US', { minimumFractionDigits: 1 })}
                            </span>
                            {liveData && (
                              <span className="block text-xs text-primary/70">live</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className={cn('w-1.5 h-1.5 rounded-full',
                                displayStatus === 'RUNNING' ? 'bg-primary animate-pulse' : 'bg-on-surface-variant/40'
                              )} />
                              <span className={cn('text-xs font-medium',
                                displayStatus === 'RUNNING' ? 'text-primary' : 'text-on-surface-variant'
                              )}>{displayStatus === 'RUNNING' ? 'Beroperasi' : displayStatus === 'STOPPED' ? 'Berhenti' : 'Maintenance'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-md',
                              item.service_status === 'OK'        ? 'bg-primary/10 text-primary' :
                              item.service_status === 'SCHEDULED' ? 'bg-tertiary/10 text-tertiary' :
                              'bg-error/10 text-error'
                            )}>
                              {item.service_status === 'OK' ? 'OK' : item.service_status === 'SCHEDULED' ? 'Terjadwal' : 'Overdue'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center text-xs text-on-surface-variant">
                            {lastSeen ? timeAgo(lastSeen) : <span className="opacity-40">—</span>}
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>

      {/* Add Machine Modal */}
      <Modal open={showAddMachine} onClose={() => setShowAddMachine(false)} title="Tambah Unit Baru">
        <form onSubmit={handleAddMachine} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Kode Unit">
              <input required className={inputCls} placeholder="BSC-001-A" value={form.machine_code} onChange={e => setForm(f => ({ ...f, machine_code: e.target.value }))} />
            </Field>
            <Field label="Nama Unit">
              <input required className={inputCls} placeholder="Bulldozer Komatsu D65" value={form.unit_name} onChange={e => setForm(f => ({ ...f, unit_name: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tipe Unit">
              <select className={inputCls} value={form.unit_type ?? ''} onChange={e => setForm(f => ({ ...f, unit_type: e.target.value as Machine['unit_type'] }))}>
                <option value="">— Pilih Tipe —</option>
                <option value="BSC">BSC</option>
                <option value="BDF">BDF</option>
              </select>
            </Field>
            <Field label="Serial Number">
              <input className={inputCls} placeholder="24-AG-01" value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} />
            </Field>
          </div>
          <Field label="Business Unit">
            <select className={selectCls} value={form.business_unit_id} onChange={e => setForm(f => ({ ...f, business_unit_id: e.target.value }))}>
              <option value="">— None —</option>
              {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <select className={selectCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Machine['status'] }))}>
                <option>RUNNING</option><option>STOPPED</option><option>MAINTENANCE</option>
              </select>
            </Field>
            <Field label="Service Status">
              <select className={selectCls} value={form.service_status} onChange={e => setForm(f => ({ ...f, service_status: e.target.value as Machine['service_status'] }))}>
                <option>OK</option><option>OVERDUE</option><option>SCHEDULED</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Current HM (h)">
              <input type="number" step="0.1" className={inputCls} value={form.current_hm || ''} onChange={e => setForm(f => ({ ...f, current_hm: parseFloat(e.target.value) || 0 }))} />
            </Field>
            <Field label="Service Interval (h)">
              <input type="number" className={inputCls} value={form.service_interval || ''} onChange={e => setForm(f => ({ ...f, service_interval: parseInt(e.target.value, 10) || 0 }))} />
            </Field>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAddMachine(false)} className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">Batal</button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-60 transition-opacity">
              {saving ? 'Menyimpan...' : 'Tambah Unit'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
