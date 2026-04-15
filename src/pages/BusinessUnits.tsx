import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Icons } from '../lib/icons';
import { cn } from '../lib/utils';
import { supabase, type BusinessUnit } from '../lib/supabase';
import Modal, { Field, inputCls, selectCls } from '../components/Modal';

type UnitWithCount = BusinessUnit & { machine_count: number; health: number };

const unitIcons = [Icons.Factory, Icons.Wrench, Icons.Globe, Icons.Zap, Icons.Machines, Icons.Activity];

const emptyForm = { name: '', location: '', status: 'Active' as BusinessUnit['status'] };

function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-3 p-4 bg-error/10 border border-error/20 rounded-2xl text-sm text-error font-medium">
      <Icons.AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 transition-opacity ml-2 font-bold">✕</button>
    </div>
  );
}

export default function BusinessUnits() {
  const navigate = useNavigate();
  const [units, setUnits] = useState<UnitWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editUnit, setEditUnit] = useState<UnitWithCount | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [{ data: buData }, { data: machineData }] = await Promise.all([
      supabase.from('business_units').select('*').order('created_at'),
      supabase.from('machines').select('business_unit_id, service_status'),
    ]);
    if (buData && machineData) {
      setUnits(buData.map(bu => {
        const buMachines = machineData.filter(m => m.business_unit_id === bu.id);
        const ok = buMachines.filter(m => m.service_status === 'OK').length;
        return { ...bu, machine_count: buMachines.length, health: buMachines.length > 0 ? Math.round((ok / buMachines.length) * 100) : 100 };
      }));
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editUnit) {
        const { error: err } = await supabase.from('business_units').update(form).eq('id', editUnit.id);
        if (err) { setError(`Gagal menyimpan unit: ${err.message}`); return; }
      } else {
        const { error: err } = await supabase.from('business_units').insert(form);
        if (err) { setError(`Gagal membuat unit: ${err.message}`); return; }
      }
      setShowAdd(false);
      setEditUnit(null);
      setForm(emptyForm);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(unit: UnitWithCount) {
    if (!confirm(`Delete "${unit.name}"? This will unlink all machines from this unit.`)) return;
    setError(null);
    const { error: err } = await supabase.from('business_units').delete().eq('id', unit.id);
    if (err) { setError(`Gagal menghapus unit: ${err.message}`); return; }
    await load();
  }

  function openEdit(unit: UnitWithCount) {
    setEditUnit(unit);
    setForm({ name: unit.name, location: unit.location, status: unit.status });
    setShowAdd(true);
  }

  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-on-surface">Business Unit</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">Kluster operasional per wilayah</p>
        </div>
        <button onClick={() => { setEditUnit(null); setForm(emptyForm); setShowAdd(true); }}
          className="px-3 py-1.5 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5">
          <Icons.Plus className="w-4 h-4" /> Tambah Unit
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-48 bg-surface-container-low rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {units.map((unit, i) => {
            const UnitIcon = unitIcons[i % unitIcons.length];
            return (
              <motion.div key={unit.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.07 }}
                className="bg-surface-container-low p-6 rounded-xl border border-outline-variant/10 hover:border-outline-variant/30 hover:shadow-sm transition-all group cursor-pointer relative"
                onClick={() => navigate('/machines')}
              >
                {/* Action buttons */}
                <div className="absolute top-4 right-4 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(unit)} className="p-1.5 rounded-lg bg-surface-container-highest text-on-surface-variant hover:text-primary transition-colors">
                    <Icons.Settings className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(unit)} className="p-1.5 rounded-lg bg-surface-container-highest text-on-surface-variant hover:text-error transition-colors">
                    <Icons.AlertTriangle className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex justify-between items-start mb-5">
                  <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                    <UnitIcon className="w-5 h-5 text-on-surface-variant group-hover:text-primary transition-colors" />
                  </div>
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-md',
                    unit.status === 'Active' ? 'bg-primary/10 text-primary' : 'bg-error/10 text-error'
                  )}>{unit.status}</span>
                </div>

                <h3 className="text-base font-semibold text-on-surface mb-0.5">{unit.name}</h3>
                <p className="text-sm text-on-surface-variant mb-5 flex items-center gap-1.5">
                  <Icons.Globe className="w-3.5 h-3.5" /> {unit.location}
                </p>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-outline-variant/10">
                  <div>
                    <p className="text-xs text-on-surface-variant mb-1">Unit Alat</p>
                    <p className="text-xl font-bold text-on-surface">{unit.machine_count}</p>
                  </div>
                  <div>
                    <p className="text-xs text-on-surface-variant mb-1">Kesehatan Fleet</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xl font-bold text-primary">{unit.health}%</p>
                      <div className="flex-1 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                        <div className="bg-primary h-full transition-all duration-500" style={{ width: `${unit.health}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditUnit(null); }} title={editUnit ? `Edit — ${editUnit.name}` : 'Business Unit Baru'}>
        <form onSubmit={handleSave} className="space-y-4">
          <Field label="Nama Unit">
            <input required className={inputCls} placeholder="Central Mining Hub" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Lokasi">
            <input required className={inputCls} placeholder="Kalimantan" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          </Field>
          <Field label="Status">
            <select className={selectCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as BusinessUnit['status'] }))}>
              <option>Active</option><option>Maintenance</option><option>Inactive</option>
            </select>
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowAdd(false); setEditUnit(null); }} className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">Batal</button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-60 transition-opacity">
              {saving ? 'Menyimpan...' : editUnit ? 'Simpan' : 'Buat Unit'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
