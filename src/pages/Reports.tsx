import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Icons } from '../lib/icons';
import { cn } from '../lib/utils';
import { supabase, type Report, type BusinessUnit } from '../lib/supabase';
import Modal, { Field, inputCls, selectCls } from '../components/Modal';

const reportIconMap: Record<Report['type'], React.ElementType> = {
  Analytics: Icons.Reports,
  Compliance: Icons.ShieldCheck,
  Forecast: Icons.TrendingUp,
  Operational: Icons.Zap,
};

const reportIconBg: Record<Report['type'], string> = {
  Analytics:   'bg-primary/10 text-primary',
  Compliance:  'bg-tertiary/10 text-tertiary',
  Forecast:    'bg-error/10 text-error',
  Operational: 'bg-surface-container-highest text-on-surface-variant',
};

const emptyForm = { title: '', type: 'Analytics' as Report['type'], file_size: '', business_unit_id: '' };

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

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filterType, setFilterType] = useState<string>('All');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [{ data: r }, { data: bu }] = await Promise.all([
      supabase.from('reports').select('*, business_units(id, name)').order('created_at', { ascending: false }),
      supabase.from('business_units').select('*').order('name'),
    ]);
    if (r) setReports(r);
    if (bu) setBusinessUnits(bu);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { error: err } = await supabase.from('reports').insert({
        title: form.title,
        type: form.type,
        file_size: form.file_size || null,
        business_unit_id: form.business_unit_id || null,
      });
      if (err) {
        setError(`Gagal membuat report: ${err.message}`);
        return;
      }
      setShowAdd(false);
      setForm(emptyForm);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(report: Report) {
    if (!confirm(`Delete report "${report.title}"?`)) return;
    setError(null);
    const { error: err } = await supabase.from('reports').delete().eq('id', report.id);
    if (err) {
      setError(`Gagal menghapus report: ${err.message}`);
      return;
    }
    await load();
  }

  function exportAll() {
    const headers = ['Title', 'Type', 'Business Unit', 'File Size', 'Created At'];
    const rows = reports.map(r => [r.title, r.type, r.business_units?.name ?? '', r.file_size ?? '', new Date(r.created_at).toLocaleDateString()]);
    const csv = [headers, ...rows].map(r => r.map(field => `"${field}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'reports.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  function downloadReport(report: Report) {
    if (report.file_url) {
      window.open(report.file_url, '_blank');
    } else {
      // Generate a simple CSV for this report
      const csv = `"Title","${report.title}"\n"Type","${report.type}"\n"Business Unit","${report.business_units?.name ?? ''}"\n"Created","${new Date(report.created_at).toLocaleString()}"`;
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${report.title.replace(/\s+/g, '-')}.csv`; a.click();
      URL.revokeObjectURL(url);
    }
  }

  const types = ['All', 'Analytics', 'Compliance', 'Forecast', 'Operational'];
  const filtered = filterType === 'All' ? reports : reports.filter(r => r.type === filterType);

  // Stats
  const totalReports = reports.length;
  const byType = types.slice(1).map(t => ({ type: t, count: reports.filter(r => r.type === t).length }));

  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-on-surface">Laporan & Analitik</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">Data operasional dan kepatuhan</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportAll} className="px-3 py-1.5 bg-surface-container-high text-on-surface text-sm font-medium rounded-lg hover:bg-surface-container-highest transition-colors flex items-center gap-1.5">
            <Icons.Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => { setForm(emptyForm); setShowAdd(true); }}
            className="px-3 py-1.5 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5">
            <Icons.Plus className="w-4 h-4" /> Laporan Baru
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {byType.map(({ type, count }) => {
          const Icon = reportIconMap[type as Report['type']];
          return (
            <button key={type} onClick={() => setFilterType(filterType === type ? 'All' : type)}
              className={cn('p-4 rounded-xl text-left transition-all border hover:shadow-sm',
                filterType === type ? 'bg-primary/10 border-primary/30' : 'bg-surface-container-low border-outline-variant/10 hover:border-outline-variant/30'
              )}>
              <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center mb-3', filterType === type ? 'bg-primary/20' : 'bg-surface-container-highest')}>
                <Icon className={cn('w-4 h-4', filterType === type ? 'text-primary' : 'text-on-surface-variant')} />
              </div>
              <p className="text-xl font-bold text-on-surface">{count}</p>
              <p className="text-xs text-on-surface-variant mt-0.5">{type}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-base text-on-surface">
              {filterType === 'All' ? 'Semua Laporan' : filterType} <span className="text-on-surface-variant font-normal text-sm">({filtered.length})</span>
            </h3>
            {filterType !== 'All' && (
              <button onClick={() => setFilterType('All')} className="text-xs text-primary hover:underline">Hapus filter</button>
            )}
          </div>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-surface-container-low rounded-xl animate-pulse" />)
            : filtered.length === 0
              ? <p className="text-sm text-on-surface-variant">Tidak ada laporan.</p>
              : filtered.map((report, i) => {
                  const ReportIcon = reportIconMap[report.type];
                  return (
                    <motion.div key={report.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                      className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/10 hover:border-outline-variant/30 hover:shadow-sm transition-all flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors', reportIconBg[report.type])}>
                          <ReportIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-on-surface group-hover:text-primary transition-colors">{report.title}</h4>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-primary">{report.type}</span>
                            <span className="text-xs text-on-surface-variant">
                              {new Date(report.created_at).toLocaleDateString('id-ID', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            {report.business_units && (
                              <span className="text-xs text-on-surface-variant">{report.business_units.name}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {report.file_size && <span className="text-xs text-on-surface-variant">{report.file_size}</span>}
                        <button onClick={() => downloadReport(report)} className="p-1.5 rounded-lg bg-surface-container-highest text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors">
                          <Icons.Download className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(report)} className="p-1.5 rounded-lg bg-surface-container-highest text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors">
                          <Icons.AlertTriangle className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
        </div>

        <div className="space-y-4">
          <div className="bg-primary/10 p-5 rounded-xl border border-primary/20">
            <h3 className="font-semibold text-base text-primary mb-3">Ringkasan</h3>
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Total Laporan</span>
                <span className="font-semibold text-on-surface">{totalReports}</span>
              </div>
              {byType.map(({ type, count }) => (
                <div key={type} className="flex justify-between text-sm">
                  <span className="text-on-surface-variant">{type}</span>
                  <span className="font-medium text-on-surface">{count}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setFilterType('All')} className="w-full py-2 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 transition-opacity">
              Lihat Semua
            </button>
          </div>

          <div className="bg-surface-container-low p-5 rounded-xl border border-outline-variant/10">
            <h3 className="font-semibold text-base text-on-surface mb-4">Laporan Terjadwal</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-on-surface">Ringkasan Mingguan</p>
                  <p className="text-xs text-on-surface-variant">Setiap Senin, 08:00</p>
                </div>
                <div className="w-10 h-6 bg-primary rounded-full relative cursor-pointer">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-on-primary rounded-full shadow-sm" />
                </div>
              </div>
              <div className="flex items-center justify-between opacity-50">
                <div>
                  <p className="text-sm font-medium text-on-surface">Kepatuhan Bulanan</p>
                  <p className="text-xs text-on-surface-variant">Tgl 1 setiap bulan</p>
                </div>
                <div className="w-10 h-6 bg-surface-container-highest rounded-full relative cursor-pointer">
                  <div className="absolute left-1 top-1 w-4 h-4 bg-on-surface-variant rounded-full shadow-sm" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Report Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Laporan Baru">
        <form onSubmit={handleAdd} className="space-y-4">
          <Field label="Judul Laporan">
            <input required className={inputCls} placeholder="Fleet Utilization Q2" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tipe">
              <select className={selectCls} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Report['type'] }))}>
                <option>Analytics</option><option>Compliance</option><option>Forecast</option><option>Operational</option>
              </select>
            </Field>
            <Field label="Ukuran File (opsional)">
              <input className={inputCls} placeholder="2.4 MB" value={form.file_size} onChange={e => setForm(f => ({ ...f, file_size: e.target.value }))} />
            </Field>
          </div>
          <Field label="Business Unit (opsional)">
            <select className={selectCls} value={form.business_unit_id} onChange={e => setForm(f => ({ ...f, business_unit_id: e.target.value }))}>
              <option value="">— Semua Unit —</option>
              {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">Batal</button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-60 transition-opacity">
              {saving ? 'Menyimpan...' : 'Buat Laporan'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
