import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion } from 'motion/react';
import { Icons } from '../lib/icons';
import { cn } from '../lib/utils';
import {
  supabase, subscribeMachines, subscribeLogs,
  type Machine, type TelemetryLog, type BusinessUnit,
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
  machine_code: '', unit_name: '', serial_number: '', tier: 'Tier 4 Industrial',
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

    return () => {
      machineSub.unsubscribe();
      logSub.unsubscribe();
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
    { label: 'Total Machines', value: String(totalMachines), change: `${running} running`, icon: Icons.Machines, color: 'text-primary', onClick: () => navigate('/machines') },
    { label: 'Weekly Hours', value: weeklyHours >= 1000 ? `${(weeklyHours / 1000).toFixed(1)}k` : weeklyHours.toFixed(1), change: 'this week', icon: Icons.Timer, color: 'text-on-surface' },
    { label: 'Due for Service', value: String(dueForService).padStart(2, '0'), change: 'CRITICAL', icon: Icons.Wrench, color: 'text-error', highlight: true, onClick: () => navigate('/machines') },
    { label: 'Utilization', value: `${utilization}%`, change: utilization >= 90 ? 'OPTIMAL' : 'NORMAL', icon: Icons.TrendingUp, color: 'text-tertiary' },
  ];

  return (
    <div className="space-y-8">
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, i) => (
          <motion.div key={kpi.label} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }}
            className={cn('bg-surface-container-low p-6 rounded-2xl relative overflow-hidden group hover:bg-surface-container-high transition-all duration-300', kpi.onClick && 'cursor-pointer')}
            onClick={kpi.onClick}
          >
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <kpi.icon className="w-16 h-16" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">{kpi.label}</p>
            <div className="flex items-baseline gap-2">
              <h2 className={cn('text-4xl font-headline font-bold tracking-tighter', kpi.color)}>{kpi.value}</h2>
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-md uppercase tracking-widest', kpi.highlight ? 'bg-error/20 text-error' : 'bg-primary/20 text-primary')}>
                {kpi.change}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Weekly Chart — dari daily_operation nyata */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="lg:col-span-8 bg-surface-container-low p-8 rounded-3xl flex flex-col">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h3 className="font-headline font-bold text-2xl tracking-tight text-on-surface">Weekly Operation Hours</h3>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mt-1">
                Fleet-wide • {weeklyHours.toFixed(1)} h this week
              </p>
            </div>
            <div className="flex gap-4">
              <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                <span className="w-2 h-2 rounded-full bg-primary" /> Operation
              </span>
            </div>
          </div>
          <div className="flex-1 h-80 w-full">
            {chartData.length === 0 || weeklyHours === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-on-surface-variant">
                <Icons.Activity className="w-10 h-10 opacity-20" />
                <p className="text-sm font-medium">No operation data this week</p>
                <p className="text-xs opacity-60">Data will appear when machines are running</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--c-outline-variant)" opacity={0.3} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--c-on-surface-variant)', fontSize: 10, fontWeight: 700 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--c-on-surface-variant)', fontSize: 10, fontWeight: 700 }} unit="h" />
                  <Tooltip
                    cursor={{ fill: 'rgba(84,224,131,0.05)' }}
                    contentStyle={{ backgroundColor: 'var(--c-surface-container-high)', border: 'none', borderRadius: '12px', color: 'var(--c-on-surface)' }}
                    formatter={(v) => [`${v ?? 0} h`, 'Operation']}
                  />
                  <Bar dataKey="primary" fill="var(--c-primary)" radius={[4, 4, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </motion.div>

        {/* Recent Events — realtime */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-4 bg-surface-container-low p-8 rounded-3xl flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-headline font-bold text-2xl tracking-tight text-on-surface">Recent Events</h3>
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" title="Live" />
          </div>
          <div className="space-y-8 flex-1">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-surface-container-high rounded-xl animate-pulse" />)
              : events.length === 0
                ? <p className="text-sm text-on-surface-variant">No events yet.</p>
                : events.map((event) => {
                    const meta = eventIconMap[event.event_type] || eventIconMap['INFO'];
                    return (
                      <div key={event.id} className="flex gap-4 group cursor-pointer" onClick={() => navigate('/machines')}>
                        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110', meta.bgColor)}>
                          <meta.icon className={cn('w-5 h-5', meta.color)} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors truncate">{event.title}</p>
                          <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-widest mt-1 opacity-70">{timeAgo(event.created_at)}</p>
                        </div>
                      </div>
                    );
                  })}
          </div>
          <button onClick={() => navigate('/machines')} className="mt-10 pt-6 border-t border-outline-variant/10 text-primary text-[10px] font-bold uppercase tracking-[0.2em] hover:underline text-left flex items-center gap-2 group">
            View all logs <Icons.ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>

        {/* Fleet Table — dengan indikator MQTT live */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="lg:col-span-12 bg-surface-container-low rounded-3xl overflow-hidden">
          <div className="p-8 border-b border-outline-variant/10 flex justify-between items-center">
            <div>
              <h3 className="font-headline font-bold text-2xl tracking-tight text-on-surface">Active Fleet Status</h3>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant mt-1">
                Live data from MQTT · auto-updates
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={exportCSV} className="px-4 py-2 rounded-xl bg-surface-container-high text-[10px] font-bold uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-highest transition-colors flex items-center gap-2">
                <Icons.Download className="w-3.5 h-3.5" /> Export CSV
              </button>
              <button onClick={() => setShowAddMachine(true)} className="px-4 py-2 rounded-xl bg-primary text-on-primary text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-opacity flex items-center gap-2 shadow-lg shadow-primary/10">
                <Icons.Plus className="w-4 h-4" /> Add Machine
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/10">
                  <th className="px-8 py-6">Machine ID</th>
                  <th className="px-8 py-6">Unit</th>
                  <th className="px-8 py-6">Business Unit</th>
                  <th className="px-8 py-6 text-right">HM (Hours)</th>
                  <th className="px-8 py-6">Engine</th>
                  <th className="px-8 py-6 text-center">Service</th>
                  <th className="px-8 py-6 text-center">Last Update</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/5">
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={7} className="px-8 py-6"><div className="h-4 bg-surface-container-high rounded animate-pulse" /></td></tr>
                    ))
                  : machines.map((item) => {
                      const isLive = item.last_mqtt_at
                        ? (Date.now() - new Date(item.last_mqtt_at).getTime()) < 60000
                        : false;
                      return (
                        <tr key={item.id} onClick={() => navigate('/machines')} className="hover:bg-surface-container-high/30 transition-colors group cursor-pointer">
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-2">
                              <span className="font-headline font-bold text-on-surface group-hover:text-primary transition-colors">{item.machine_code}</span>
                              {isLive && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" title="Live MQTT" />}
                            </div>
                          </td>
                          <td className="px-8 py-5 text-sm text-on-surface-variant font-medium">{item.unit_name}</td>
                          <td className="px-8 py-5 text-sm text-on-surface-variant font-medium">{item.business_units?.name ?? '—'}</td>
                          <td className="px-8 py-5 text-right">
                            <span className="font-headline font-bold text-on-surface">{Number(item.current_hm).toLocaleString('en-US', { minimumFractionDigits: 1 })}</span>
                            {item.hm_seconds !== undefined && (
                              <span className="block text-[10px] text-on-surface-variant opacity-60">
                                {item.hm_seconds.toLocaleString()} sec
                              </span>
                            )}
                          </td>
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-2">
                              <span className={cn('w-2 h-2 rounded-full',
                                item.status === 'RUNNING' ? 'bg-primary animate-pulse' : 'bg-on-surface-variant'
                              )} />
                              <span className={cn('text-[10px] font-bold uppercase tracking-widest',
                                item.status === 'RUNNING' ? 'text-primary' : 'text-on-surface-variant'
                              )}>{item.status}</span>
                            </div>
                          </td>
                          <td className="px-8 py-5 text-center">
                            <span className={cn('text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-widest',
                              item.service_status === 'OK' ? 'bg-primary/10 text-primary' :
                              item.service_status === 'SCHEDULED' ? 'bg-tertiary/10 text-tertiary' :
                              'bg-error/10 text-error'
                            )}>
                              {item.service_status}
                            </span>
                          </td>
                          <td className="px-8 py-5 text-center text-[10px] text-on-surface-variant font-medium">
                            {item.last_mqtt_at
                              ? timeAgo(item.last_mqtt_at)
                              : <span className="opacity-40">No MQTT</span>}
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
      <Modal open={showAddMachine} onClose={() => setShowAddMachine(false)} title="Add New Machine">
        <form onSubmit={handleAddMachine} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Machine Code">
              <input required className={inputCls} placeholder="EXC-001-A" value={form.machine_code} onChange={e => setForm(f => ({ ...f, machine_code: e.target.value }))} />
            </Field>
            <Field label="Unit Name">
              <input required className={inputCls} placeholder="Excavator Series 7" value={form.unit_name} onChange={e => setForm(f => ({ ...f, unit_name: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Serial Number">
              <input className={inputCls} placeholder="24-AG-01" value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} />
            </Field>
            <Field label="Tier">
              <input className={inputCls} placeholder="Tier 4 Industrial" value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))} />
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
            <button type="button" onClick={() => setShowAddMachine(false)} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-6 py-2.5 bg-primary text-on-primary font-bold rounded-xl text-xs uppercase tracking-widest hover:opacity-90 disabled:opacity-60">
              {saving ? 'Saving...' : 'Add Machine'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
