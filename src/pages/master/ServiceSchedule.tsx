import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Icons } from '../../lib/icons';
import { cn } from '../../lib/utils';
import { supabase, type Machine } from '../../lib/supabase';
import Modal, { Field, inputCls, selectCls } from '../../components/Modal';

type ScheduleRow = {
  id: string;
  machine_id: string;
  scheduled_date: string;
  hm_target: number;
  description: string | null;
  status: 'Pending' | 'Done' | 'Overdue';
  created_at: string;
  machines?: Pick<Machine, 'id' | 'machine_code' | 'unit_name'>;
};

const emptyForm = {
  machine_id: '',
  scheduled_date: '',
  hm_target: 0,
  description: '',
  status: 'Pending' as ScheduleRow['status'],
};

function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-3 p-4 bg-error/10 border border-error/20 rounded-2xl text-sm text-error font-medium">
      <Icons.AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 transition-opacity ml-2 font-bold">✕</button>
    </div>
  );
}

const statusColors: Record<ScheduleRow['status'], string> = {
  'Pending': 'bg-tertiary/10 text-tertiary',
  'Done':    'bg-primary/10 text-primary',
  'Overdue': 'bg-error/10 text-error',
};

const statusIcons: Record<ScheduleRow['status'], React.ElementType> = {
  'Pending': Icons.Calendar,
  'Done':    Icons.CheckCircle2,
  'Overdue': Icons.AlertTriangle,
};

export default function ServiceSchedule() {
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | ScheduleRow['status']>('all');

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ScheduleRow | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    const [{ data: s, error: se }, { data: m }] = await Promise.all([
      supabase
        .from('service_schedules')
        .select('*, machines(id, machine_code, unit_name)')
        .order('scheduled_date', { ascending: true }),
      supabase.from('machines').select('id, machine_code, unit_name').order('machine_code'),
    ]);
    if (se) setError(`Gagal memuat data: ${se.message}`);
    if (s) setSchedules(s);
    if (m) setMachines(m as Machine[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(row: ScheduleRow) {
    setEditTarget(row);
    setForm({
      machine_id: row.machine_id,
      scheduled_date: row.scheduled_date.split('T')[0],
      hm_target: row.hm_target,
      description: row.description ?? '',
      status: row.status,
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        machine_id: form.machine_id,
        scheduled_date: form.scheduled_date,
        hm_target: form.hm_target,
        description: form.description || null,
        status: form.status,
      };

      if (editTarget) {
        const { error: err } = await supabase.from('service_schedules').update(payload).eq('id', editTarget.id);
        if (err) { setError(`Gagal menyimpan: ${err.message}`); return; }
      } else {
        const { error: err } = await supabase.from('service_schedules').insert(payload);
        if (err) { setError(`Gagal menambahkan: ${err.message}`); return; }
      }
      setShowModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: ScheduleRow) {
    const machineName = row.machines ? `${row.machines.machine_code} — ${row.machines.unit_name}` : row.machine_id;
    if (!confirm(`Hapus jadwal service untuk "${machineName}" pada ${new Date(row.scheduled_date).toLocaleDateString('id-ID')}?`)) return;
    setError(null);
    const { error: err } = await supabase.from('service_schedules').delete().eq('id', row.id);
    if (err) { setError(`Gagal menghapus: ${err.message}`); return; }
    await load();
  }

  const filtered = schedules.filter(s => {
    const matchStatus = filterStatus === 'all' || s.status === filterStatus;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (s.machines?.machine_code ?? '').toLowerCase().includes(q) ||
      (s.machines?.unit_name ?? '').toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const counts = {
    Pending: schedules.filter(s => s.status === 'Pending').length,
    Done:    schedules.filter(s => s.status === 'Done').length,
    Overdue: schedules.filter(s => s.status === 'Overdue').length,
  };

  return (
    <div className="space-y-8">
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-on-surface">Jadwal Service</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Jadwal perawatan unit — {schedules.length} entri
          </p>
        </div>
        <button onClick={openAdd}
          className="px-3 py-1.5 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5">
          <Icons.Plus className="w-4 h-4" /> Tambah Jadwal
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {(['Pending', 'Done', 'Overdue'] as const).map(s => {
          const StatusIcon = statusIcons[s];
          const [iconBg, iconText] = statusColors[s].split(' ');
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(prev => prev === s ? 'all' : s)}
              className={cn(
                'p-4 rounded-xl border text-left transition-all hover:shadow-sm',
                filterStatus === s
                  ? `${iconBg} border-current/30`
                  : 'border-outline-variant/10 bg-surface-container-low hover:border-outline-variant/30'
              )}
            >
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-3', filterStatus === s ? 'bg-current/20' : statusColors[s].split(' ')[0])}>
                <StatusIcon className={cn('w-4 h-4', filterStatus === s ? iconText : iconText)} />
              </div>
              <div className={cn('text-2xl font-bold', iconText)}>{counts[s]}</div>
              <div className={cn('text-xs font-medium mt-0.5', iconText)}>{s}</div>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
        <input
          type="text"
          placeholder="Cari mesin, deskripsi..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl pl-10 pr-4 py-2.5 text-sm text-on-surface focus:ring-2 focus:ring-primary/40 outline-none transition-all"
        />
      </div>

      {/* Table */}
      <div className="bg-surface-container-low rounded-xl overflow-hidden border border-outline-variant/10">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-xs font-medium text-on-surface-variant border-b border-outline-variant/10 bg-surface-container-high/40">
                <th className="px-6 py-4">Mesin</th>
                <th className="px-6 py-4">Tanggal Terjadwal</th>
                <th className="px-6 py-4 text-right">HM Target (h)</th>
                <th className="px-6 py-4">Deskripsi</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={6} className="px-6 py-4">
                      <div className="h-4 bg-surface-container-high rounded animate-pulse" />
                    </td></tr>
                  ))
                : filtered.length === 0
                  ? <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-on-surface-variant">
                      {search || filterStatus !== 'all' ? 'Tidak ada jadwal yang cocok.' : 'Belum ada jadwal service.'}
                    </td></tr>
                  : filtered.map((row, i) => {
                      const isOverdue = row.status === 'Pending' && new Date(row.scheduled_date) < new Date();
                      return (
                        <motion.tr key={row.id}
                          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                          className="hover:bg-surface-container-high/40 transition-colors group"
                        >
                          <td className="px-6 py-4">
                            <div>
                              <div className="text-sm font-medium text-on-surface">
                                {row.machines?.machine_code ?? '—'}
                              </div>
                              <div className="text-xs text-on-surface-variant mt-0.5">{row.machines?.unit_name ?? '—'}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn('text-sm', isOverdue ? 'text-error font-medium' : 'text-on-surface')}>
                              {new Date(row.scheduled_date).toLocaleDateString('id-ID', {
                                day: 'numeric', month: 'long', year: 'numeric'
                              })}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right text-sm font-semibold text-on-surface">
                            {row.hm_target.toLocaleString('en-US')}
                          </td>
                          <td className="px-6 py-4 text-sm text-on-surface-variant max-w-xs">
                            <span className="line-clamp-2">{row.description ?? '—'}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-md', statusColors[row.status])}>
                              {row.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center justify-center gap-2">
                              <button onClick={() => openEdit(row)}
                                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors"
                                title="Edit">
                                <Icons.Settings className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(row)}
                                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors"
                                title="Hapus">
                                <Icons.AlertTriangle className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add/Edit */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editTarget ? 'Edit Jadwal Service' : 'Tambah Jadwal Service'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Field label="Mesin">
            <select required className={selectCls} value={form.machine_id} onChange={e => setForm(f => ({ ...f, machine_id: e.target.value }))}>
              <option value="">— Pilih Mesin —</option>
              {machines.map(m => (
                <option key={m.id} value={m.id}>{m.machine_code} — {m.unit_name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tanggal Terjadwal">
              <input required type="date" className={inputCls}
                value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} />
            </Field>
            <Field label="HM Target (jam)">
              <input required type="number" className={inputCls} placeholder="5000"
                value={form.hm_target || ''} onChange={e => setForm(f => ({ ...f, hm_target: parseInt(e.target.value) || 0 }))} />
            </Field>
          </div>
          <Field label="Deskripsi / Catatan">
            <textarea className={inputCls} rows={3} placeholder="Penggantian oli, filter udara, dll."
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </Field>
          <Field label="Status">
            <select className={selectCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ScheduleRow['status'] }))}>
              <option>Pending</option>
              <option>Done</option>
              <option>Overdue</option>
            </select>
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)}
              className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">
              Batal
            </button>
            <button type="submit" disabled={saving}
              className="px-5 py-2 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-60 transition-opacity">
              {saving ? 'Menyimpan...' : editTarget ? 'Simpan' : 'Tambah'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
