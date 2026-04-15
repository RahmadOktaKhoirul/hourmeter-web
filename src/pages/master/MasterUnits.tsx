import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Icons } from '../../lib/icons';
import { cn } from '../../lib/utils';
import { supabase, type Machine, type BusinessUnit } from '../../lib/supabase';
import Modal, { Field, inputCls, selectCls } from '../../components/Modal';

const UNIT_TYPES: Array<Machine['unit_type']> = ['BSC', 'BDF'];

const emptyForm = {
  machine_code: '',
  unit_name: '',
  unit_type: '' as Machine['unit_type'],
  serial_number: '',
  tier: '',
  business_unit_id: '',
  device_id: '',
  status: 'STOPPED' as Machine['status'],
  service_status: 'OK' as Machine['service_status'],
  current_hm: 0,
  service_interval: 500,
  hours_to_service: 500,
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

const unitTypeColors: Record<string, string> = {
  BSC: 'bg-primary/10 text-primary',
  BDF: 'bg-tertiary/10 text-tertiary',
};

export default function MasterUnits() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Machine | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    const [{ data: m, error: me }, { data: bu }] = await Promise.all([
      supabase.from('machines').select('*, business_units(id, name, location)').order('created_at'),
      supabase.from('business_units').select('*').order('name'),
    ]);
    if (me) setError(`Gagal memuat data: ${me.message}`);
    if (m) setMachines(m);
    if (bu) setBusinessUnits(bu);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(machine: Machine) {
    setEditTarget(machine);
    setForm({
      machine_code: machine.machine_code,
      unit_name: machine.unit_name,
      unit_type: machine.unit_type,
      serial_number: machine.serial_number ?? '',
      tier: machine.tier ?? '',
      business_unit_id: machine.business_unit_id ?? '',
      device_id: machine.device_id ?? '',
      status: machine.status,
      service_status: machine.service_status,
      current_hm: machine.current_hm,
      service_interval: machine.service_interval ?? 500,
      hours_to_service: machine.hours_to_service ?? 500,
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        machine_code: form.machine_code,
        unit_name: form.unit_name,
        unit_type: form.unit_type || null,
        serial_number: form.serial_number || null,
        tier: form.tier || null,
        business_unit_id: form.business_unit_id || null,
        device_id: form.device_id || null,
        status: form.status,
        service_status: form.service_status,
        current_hm: form.current_hm,
        service_interval: form.service_interval,
        hours_to_service: form.hours_to_service,
      };

      if (editTarget) {
        const { error: err } = await supabase.from('machines').update(payload).eq('id', editTarget.id);
        if (err) { setError(`Gagal menyimpan: ${err.message}`); return; }
      } else {
        const { error: err } = await supabase.from('machines').insert(payload);
        if (err) { setError(`Gagal menambahkan: ${err.message}`); return; }
      }
      setShowModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(machine: Machine) {
    if (!confirm(`Hapus unit "${machine.machine_code} — ${machine.unit_name}"?`)) return;
    setError(null);
    const { error: err } = await supabase.from('machines').delete().eq('id', machine.id);
    if (err) { setError(`Gagal menghapus: ${err.message}`); return; }
    await load();
  }

  const filtered = machines.filter(m => {
    const matchType = filterType === 'all' || m.unit_type === filterType;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      m.machine_code.toLowerCase().includes(q) ||
      m.unit_name.toLowerCase().includes(q) ||
      (m.unit_type ?? '').toLowerCase().includes(q) ||
      (m.business_units?.name ?? '').toLowerCase().includes(q);
    return matchType && matchSearch;
  });

  const countBSC = machines.filter(m => m.unit_type === 'BSC').length;
  const countBDF = machines.filter(m => m.unit_type === 'BDF').length;

  return (
    <div className="space-y-8">
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-on-surface">Unit / Alat Berat</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Master data unit — {machines.length} unit terdaftar
          </p>
        </div>
        <button onClick={openAdd}
          className="px-3 py-1.5 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5">
          <Icons.Plus className="w-4 h-4" /> Tambah Unit
        </button>
      </div>

      {/* Filter tipe unit */}
      <div className="flex gap-3 flex-wrap">
        {[
          { key: 'all', label: `Semua (${machines.length})` },
          { key: 'BSC', label: `BSC (${countBSC})` },
          { key: 'BDF', label: `BDF (${countBDF})` },
        ].map(f => (
          <button key={f.key} onClick={() => setFilterType(f.key)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              filterType === f.key
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high border border-outline-variant/10'
            )}>
            {f.label}
          </button>
        ))}

        {/* Search */}
        <div className="relative ml-auto">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Cari unit, kode, business unit..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-64 bg-surface-container-low border border-outline-variant/20 rounded-xl pl-10 pr-4 py-2 text-sm text-on-surface focus:ring-2 focus:ring-primary/40 outline-none transition-all"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-container-low rounded-xl overflow-hidden border border-outline-variant/10">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-xs font-medium text-on-surface-variant border-b border-outline-variant/10 bg-surface-container-high/40">
                <th className="px-6 py-4">Kode Unit</th>
                <th className="px-6 py-4">Nama Unit</th>
                <th className="px-6 py-4 text-center">Tipe</th>
                <th className="px-6 py-4">Serial No.</th>
                <th className="px-6 py-4">Business Unit</th>
                <th className="px-6 py-4">Device ID</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Service</th>
                <th className="px-6 py-4 text-right">HM (h)</th>
                <th className="px-6 py-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={10} className="px-6 py-4">
                      <div className="h-4 bg-surface-container-high rounded animate-pulse" />
                    </td></tr>
                  ))
                : filtered.length === 0
                  ? <tr><td colSpan={10} className="px-6 py-10 text-center text-sm text-on-surface-variant">
                      {search || filterType !== 'all' ? 'Tidak ada unit yang cocok.' : 'Belum ada unit.'}
                    </td></tr>
                  : filtered.map((m, i) => (
                      <motion.tr key={m.id}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                        className="hover:bg-surface-container-high/40 transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <span className="text-sm font-medium text-on-surface">{m.machine_code}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-on-surface">{m.unit_name}</td>
                        <td className="px-6 py-4 text-center">
                          {m.unit_type
                            ? <span className={cn('text-xs font-medium px-2 py-0.5 rounded-md', unitTypeColors[m.unit_type] ?? 'bg-surface-container-highest text-on-surface-variant')}>
                                {m.unit_type}
                              </span>
                            : <span className="text-xs text-on-surface-variant opacity-40">—</span>}
                        </td>
                        <td className="px-6 py-4 text-sm text-on-surface-variant">{m.serial_number ?? '—'}</td>
                        <td className="px-6 py-4 text-sm text-on-surface-variant">{m.business_units?.name ?? '—'}</td>
                        <td className="px-6 py-4">
                          {m.device_id
                            ? <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-primary/10 text-primary">{m.device_id}</span>
                            : <span className="text-xs text-on-surface-variant opacity-40">—</span>}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-md',
                            m.status === 'RUNNING'     ? 'bg-primary/10 text-primary' :
                            m.status === 'MAINTENANCE' ? 'bg-tertiary/10 text-tertiary' :
                            'bg-surface-container-highest text-on-surface-variant'
                          )}>{m.status === 'RUNNING' ? 'Beroperasi' : m.status === 'STOPPED' ? 'Berhenti' : 'Maintenance'}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-md',
                            m.service_status === 'OK'        ? 'bg-primary/10 text-primary' :
                            m.service_status === 'SCHEDULED' ? 'bg-tertiary/10 text-tertiary' :
                            'bg-error/10 text-error'
                          )}>{m.service_status === 'OK' ? 'OK' : m.service_status === 'SCHEDULED' ? 'Terjadwal' : 'Overdue'}</span>
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-semibold text-on-surface">
                          {Number(m.current_hm).toLocaleString('en-US', { minimumFractionDigits: 1 })}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => openEdit(m)}
                              className="p-1.5 rounded-lg text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors"
                              title="Edit">
                              <Icons.Settings className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(m)}
                              className="p-1.5 rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors"
                              title="Hapus">
                              <Icons.AlertTriangle className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add/Edit */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editTarget ? `Edit Unit — ${editTarget.machine_code}` : 'Tambah Unit Baru'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Kode Unit">
              <input required className={inputCls} placeholder="BSC-001-A"
                value={form.machine_code} onChange={e => setForm(f => ({ ...f, machine_code: e.target.value }))} />
            </Field>
            <Field label="Nama Unit">
              <input required className={inputCls} placeholder="Bulldozer Komatsu D65"
                value={form.unit_name} onChange={e => setForm(f => ({ ...f, unit_name: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tipe Unit">
              <select required className={selectCls} value={form.unit_type ?? ''} onChange={e => setForm(f => ({ ...f, unit_type: e.target.value as Machine['unit_type'] }))}>
                <option value="">— Pilih Tipe —</option>
                {UNIT_TYPES.map(t => <option key={t} value={t ?? ''}>{t}</option>)}
              </select>
            </Field>
            <Field label="Serial Number">
              <input className={inputCls} placeholder="24-AG-01"
                value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tier / Spesifikasi">
              <input className={inputCls} placeholder="Tier 4 Industrial"
                value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))} />
            </Field>
            <Field label="Business Unit">
              <select className={selectCls} value={form.business_unit_id} onChange={e => setForm(f => ({ ...f, business_unit_id: e.target.value }))}>
                <option value="">— None —</option>
                {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Device ID (hour_meter_logs)">
            <input className={inputCls} placeholder="machine_1"
              value={form.device_id} onChange={e => setForm(f => ({ ...f, device_id: e.target.value }))} />
            <p className="text-xs text-on-surface-variant mt-1">
              Sesuaikan dengan machine_id yang dikirim ESP32 (contoh: machine_1)
            </p>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Status Operasi">
              <select className={selectCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Machine['status'] }))}>
                <option>RUNNING</option><option>STOPPED</option><option>MAINTENANCE</option>
              </select>
            </Field>
            <Field label="Status Service">
              <select className={selectCls} value={form.service_status} onChange={e => setForm(f => ({ ...f, service_status: e.target.value as Machine['service_status'] }))}>
                <option>OK</option><option>SCHEDULED</option><option>OVERDUE</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Current HM (h)">
              <input type="number" step="0.1" className={inputCls} value={form.current_hm || ''}
                onChange={e => setForm(f => ({ ...f, current_hm: parseFloat(e.target.value) || 0 }))} />
            </Field>
            <Field label="Interval Service (h)">
              <input type="number" className={inputCls} value={form.service_interval || ''}
                onChange={e => setForm(f => ({ ...f, service_interval: parseInt(e.target.value) || 500 }))} />
            </Field>
            <Field label="Sisa Menuju Service (h)">
              <input type="number" step="0.1" className={inputCls} value={form.hours_to_service || ''}
                onChange={e => setForm(f => ({ ...f, hours_to_service: parseFloat(e.target.value) || 500 }))} />
            </Field>
          </div>
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
