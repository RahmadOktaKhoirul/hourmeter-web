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
    <div className="space-y-10">
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-black font-headline tracking-tighter text-on-surface">Reports & Analytics</h2>
          <p className="text-on-surface-variant font-medium tracking-widest uppercase opacity-70 mt-1">Operational intelligence and compliance</p>
        </div>
        <div className="flex gap-3">
          <button onClick={exportAll} className="px-6 py-3 bg-surface-container-high text-on-surface font-bold rounded-2xl hover:bg-surface-container-highest transition-all uppercase tracking-widest text-xs flex items-center gap-2">
            <Icons.Download className="w-4 h-4" /> Export All
          </button>
          <button onClick={() => { setForm(emptyForm); setShowAdd(true); }}
            className="px-6 py-3 bg-primary text-on-primary font-bold rounded-2xl shadow-xl shadow-primary/20 hover:opacity-90 transition-all uppercase tracking-widest text-xs flex items-center gap-2">
            <Icons.Plus className="w-4 h-4" /> New Report
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {byType.map(({ type, count }) => {
          const Icon = reportIconMap[type as Report['type']];
          return (
            <button key={type} onClick={() => setFilterType(filterType === type ? 'All' : type)}
              className={cn('p-5 rounded-2xl text-left transition-all border',
                filterType === type ? 'bg-primary/10 border-primary/30' : 'bg-surface-container-low border-outline-variant/10 hover:bg-surface-container-high'
              )}>
              <Icon className={cn('w-5 h-5 mb-2', filterType === type ? 'text-primary' : 'text-on-surface-variant')} />
              <p className="text-2xl font-headline font-bold text-on-surface">{count}</p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mt-0.5">{type}</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xl font-headline font-bold text-on-surface">
              {filterType === 'All' ? 'All Reports' : filterType} <span className="text-on-surface-variant font-normal text-base">({filtered.length})</span>
            </h3>
            {filterType !== 'All' && (
              <button onClick={() => setFilterType('All')} className="text-xs font-bold text-primary hover:underline uppercase tracking-widest">Clear filter</button>
            )}
          </div>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-surface-container-low rounded-3xl animate-pulse" />)
            : filtered.length === 0
              ? <p className="text-sm text-on-surface-variant px-2">No reports found.</p>
              : filtered.map((report, i) => {
                  const ReportIcon = reportIconMap[report.type];
                  return (
                    <motion.div key={report.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      className="bg-surface-container-low p-6 rounded-3xl border border-outline-variant/10 hover:bg-surface-container-high transition-all flex items-center justify-between group">
                      <div className="flex items-center gap-6">
                        <div className="w-12 h-12 rounded-2xl bg-surface-container-highest flex items-center justify-center text-on-surface-variant group-hover:text-primary transition-colors">
                          <ReportIcon className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-bold text-on-surface group-hover:text-primary transition-colors">{report.title}</h4>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">{report.type}</span>
                            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
                              {new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            {report.business_units && (
                              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{report.business_units.name}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {report.file_size && <span className="text-xs font-medium text-on-surface-variant">{report.file_size}</span>}
                        <button onClick={() => downloadReport(report)} className="p-2 rounded-xl bg-surface-container-highest text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-all">
                          <Icons.Download className="w-5 h-5" />
                        </button>
                        <button onClick={() => handleDelete(report)} className="p-2 rounded-xl bg-surface-container-highest text-on-surface-variant hover:text-error hover:bg-error/10 transition-all">
                          <Icons.AlertTriangle className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
        </div>

        <div className="space-y-8">
          <div className="bg-primary/10 p-8 rounded-3xl border border-primary/20">
            <h3 className="text-xl font-headline font-bold text-primary mb-4">Quick Insights</h3>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Total Reports</span>
                <span className="font-bold text-on-surface">{totalReports}</span>
              </div>
              {byType.map(({ type, count }) => (
                <div key={type} className="flex justify-between text-sm">
                  <span className="text-on-surface-variant">{type}</span>
                  <span className="font-bold text-on-surface">{count}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setFilterType('All')} className="w-full py-3 bg-primary text-on-primary font-bold rounded-xl text-xs uppercase tracking-widest hover:opacity-90 transition-all">
              View All Reports
            </button>
          </div>

          <div className="bg-surface-container-low p-8 rounded-3xl border border-outline-variant/10">
            <h3 className="text-xl font-headline font-bold text-on-surface mb-6">Scheduled Reports</h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-on-surface">Weekly Summary</p>
                  <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">Every Monday, 8 AM</p>
                </div>
                <div className="w-10 h-6 bg-primary rounded-full relative cursor-pointer">
                  <div className="absolute right-1 top-1 w-4 h-4 bg-on-primary rounded-full shadow-sm" />
                </div>
              </div>
              <div className="flex items-center justify-between opacity-50">
                <div>
                  <p className="text-sm font-bold text-on-surface">Monthly Compliance</p>
                  <p className="text-[10px] text-on-surface-variant uppercase font-bold tracking-widest">1st of Month, 12 AM</p>
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
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Report">
        <form onSubmit={handleAdd} className="space-y-4">
          <Field label="Report Title">
            <input required className={inputCls} placeholder="Fleet Utilization Q2" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              <select className={selectCls} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as Report['type'] }))}>
                <option>Analytics</option><option>Compliance</option><option>Forecast</option><option>Operational</option>
              </select>
            </Field>
            <Field label="File Size (optional)">
              <input className={inputCls} placeholder="2.4 MB" value={form.file_size} onChange={e => setForm(f => ({ ...f, file_size: e.target.value }))} />
            </Field>
          </div>
          <Field label="Business Unit (optional)">
            <select className={selectCls} value={form.business_unit_id} onChange={e => setForm(f => ({ ...f, business_unit_id: e.target.value }))}>
              <option value="">— All Units —</option>
              {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-6 py-2.5 bg-primary text-on-primary font-bold rounded-xl text-xs uppercase tracking-widest hover:opacity-90 disabled:opacity-60">
              {saving ? 'Saving...' : 'Create Report'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
