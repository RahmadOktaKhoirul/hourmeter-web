import { useState } from 'react';
import { motion } from 'motion/react';
import { Icons } from '../../lib/icons';
import { cn } from '../../lib/utils';

type Role = 'Fleet Overseer' | 'Unit Manager' | 'Maintenance Lead' | 'Operator';

type Permission = {
  id: string;
  label: string;
  description: string;
  category: 'Dashboard' | 'Machines' | 'Reports' | 'Master' | 'Settings';
};

const PERMISSIONS: Permission[] = [
  // Dashboard
  { id: 'dashboard.view',      label: 'Lihat Dashboard',        description: 'Akses halaman dashboard utama',              category: 'Dashboard' },
  { id: 'dashboard.realtime',  label: 'Data Realtime',          description: 'Lihat data HM live dari IoT device',         category: 'Dashboard' },
  // Machines
  { id: 'machines.view',       label: 'Lihat Mesin',            description: 'Akses halaman daftar mesin',                 category: 'Machines' },
  { id: 'machines.edit',       label: 'Edit Mesin',             description: 'Ubah data mesin (status, HM, dll)',          category: 'Machines' },
  { id: 'machines.delete',     label: 'Hapus Mesin',            description: 'Hapus data mesin dari sistem',               category: 'Machines' },
  { id: 'machines.shift',      label: 'Kelola Shift',           description: 'Tambah dan tutup shift operasi',             category: 'Machines' },
  // Reports
  { id: 'reports.view',        label: 'Lihat Laporan',          description: 'Akses daftar laporan',                       category: 'Reports' },
  { id: 'reports.create',      label: 'Buat Laporan',           description: 'Tambah laporan baru',                        category: 'Reports' },
  { id: 'reports.delete',      label: 'Hapus Laporan',          description: 'Hapus laporan dari sistem',                  category: 'Reports' },
  { id: 'reports.export',      label: 'Export Laporan',         description: 'Unduh file laporan',                         category: 'Reports' },
  // Master
  { id: 'master.view',         label: 'Akses Menu Master',      description: 'Lihat submenu Master di sidebar',            category: 'Master' },
  { id: 'master.units',        label: 'Kelola Unit/Mesin',      description: 'CRUD data master mesin',                     category: 'Master' },
  { id: 'master.users',        label: 'Kelola User & Role',     description: 'CRUD akun pengguna dan role',                category: 'Master' },
  { id: 'master.service',      label: 'Kelola Jadwal Service',  description: 'CRUD jadwal perawatan mesin',                category: 'Master' },
  { id: 'master.rbac',         label: 'Kelola RBAC',            description: 'Ubah konfigurasi hak akses role',            category: 'Master' },
  // Settings
  { id: 'settings.view',       label: 'Lihat Pengaturan',       description: 'Akses halaman pengaturan',                   category: 'Settings' },
  { id: 'settings.edit',       label: 'Ubah Pengaturan',        description: 'Simpan perubahan pengaturan sistem',         category: 'Settings' },
];

// Default permission matrix
const DEFAULT_MATRIX: Record<Role, Set<string>> = {
  'Fleet Overseer':   new Set(PERMISSIONS.map(p => p.id)),
  'Unit Manager':     new Set([
    'dashboard.view','dashboard.realtime',
    'machines.view','machines.edit','machines.shift',
    'reports.view','reports.create','reports.export',
    'master.view','master.units','master.service',
    'settings.view',
  ]),
  'Maintenance Lead': new Set([
    'dashboard.view','dashboard.realtime',
    'machines.view','machines.edit','machines.shift',
    'reports.view','reports.export',
    'master.view','master.service',
    'settings.view',
  ]),
  'Operator': new Set([
    'dashboard.view',
    'machines.view','machines.shift',
    'reports.view',
    'settings.view',
  ]),
};

const ROLES: Role[] = ['Fleet Overseer', 'Unit Manager', 'Maintenance Lead', 'Operator'];
const CATEGORIES = ['Dashboard', 'Machines', 'Reports', 'Master', 'Settings'] as const;

const roleColors: Record<Role, string> = {
  'Fleet Overseer':   'bg-primary/10 text-primary border-primary/20',
  'Unit Manager':     'bg-tertiary/10 text-tertiary border-tertiary/20',
  'Maintenance Lead': 'bg-error/10 text-error border-error/20',
  'Operator':         'bg-surface-container-highest text-on-surface-variant border-outline-variant/20',
};

export default function RBAC() {
  const [matrix, setMatrix] = useState<Record<Role, Set<string>>>(() => {
    // Coba load dari localStorage
    try {
      const saved = localStorage.getItem('hm_rbac_matrix');
      if (saved) {
        const parsed = JSON.parse(saved) as Record<Role, string[]>;
        return {
          'Fleet Overseer':   new Set(parsed['Fleet Overseer'] ?? []),
          'Unit Manager':     new Set(parsed['Unit Manager'] ?? []),
          'Maintenance Lead': new Set(parsed['Maintenance Lead'] ?? []),
          'Operator':         new Set(parsed['Operator'] ?? []),
        };
      }
    } catch { /* fallback */ }
    return DEFAULT_MATRIX;
  });
  const [saved, setSaved] = useState(false);
  const [activeRole, setActiveRole] = useState<Role>('Fleet Overseer');

  function toggle(role: Role, permId: string) {
    setMatrix(prev => {
      const next = new Set(prev[role]);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return { ...prev, [role]: next };
    });
    setSaved(false);
  }

  function toggleAll(role: Role, category: string, value: boolean) {
    const inCat = PERMISSIONS.filter(p => p.category === category).map(p => p.id);
    setMatrix(prev => {
      const next = new Set(prev[role]);
      inCat.forEach(id => value ? next.add(id) : next.delete(id));
      return { ...prev, [role]: next };
    });
    setSaved(false);
  }

  function handleSave() {
    const serializable: Record<string, string[]> = {};
    for (const role of ROLES) serializable[role] = [...matrix[role]];
    localStorage.setItem('hm_rbac_matrix', JSON.stringify(serializable));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function handleReset() {
    if (!confirm('Reset ke konfigurasi default? Semua perubahan akan hilang.')) return;
    setMatrix(DEFAULT_MATRIX);
    localStorage.removeItem('hm_rbac_matrix');
    setSaved(false);
  }

  const permCount = (role: Role) => matrix[role].size;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-on-surface">Hak Akses (RBAC)</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Konfigurasi hak akses per role
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface border border-outline-variant/20 rounded-lg transition-colors">
            Reset Default
          </button>
          <button onClick={handleSave}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-1.5 transition-all',
              saved
                ? 'bg-primary/10 text-primary'
                : 'bg-primary text-on-primary hover:opacity-90'
            )}>
            {saved ? <><Icons.CheckCircle2 className="w-4 h-4" /> Tersimpan</> : <><Icons.Key className="w-4 h-4" /> Simpan Perubahan</>}
          </button>
        </div>
      </div>

      {/* Role selector cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ROLES.map(role => (
          <button
            key={role}
            onClick={() => setActiveRole(role)}
            className={cn(
              'p-4 rounded-xl border-2 text-left transition-all',
              activeRole === role ? roleColors[role] : 'border-outline-variant/10 bg-surface-container-low hover:border-outline-variant/30 text-on-surface-variant'
            )}
          >
            <div className="font-semibold text-base leading-tight">{role}</div>
            <div className="text-xs text-current/70 mt-1.5">
              {permCount(role)} / {PERMISSIONS.length} hak akses
            </div>
            {/* Mini progress bar */}
            <div className="mt-2 h-1 rounded-full bg-current/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-current transition-all duration-500"
                style={{ width: `${(permCount(role) / PERMISSIONS.length) * 100}%` }}
              />
            </div>
          </button>
        ))}
      </div>

      {/* Permission matrix for selected role */}
      <div className="bg-surface-container-low rounded-xl border border-outline-variant/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-outline-variant/10 bg-surface-container-high/30 flex items-center gap-3">
          <Icons.Shield className="w-4 h-4 text-primary" />
          <span className="font-medium text-sm text-on-surface">Hak Akses — <span className={cn('font-semibold', roleColors[activeRole].split(' ')[1])}>{activeRole}</span></span>
        </div>

        <div className="divide-y divide-outline-variant/5">
          {CATEGORIES.map(category => {
            const perms = PERMISSIONS.filter(p => p.category === category);
            const allChecked = perms.every(p => matrix[activeRole].has(p.id));
            const someChecked = perms.some(p => matrix[activeRole].has(p.id));

            return (
              <div key={category}>
                {/* Category header */}
                <div className="px-6 py-3 bg-surface-container-high/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-on-surface-variant">{category}</span>
                    <span className="text-xs text-on-surface-variant/50">
                      ({perms.filter(p => matrix[activeRole].has(p.id)).length}/{perms.length})
                    </span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-xs text-on-surface-variant">
                      {allChecked ? 'Hapus semua' : 'Pilih semua'}
                    </span>
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                      onChange={e => toggleAll(activeRole, category, e.target.checked)}
                      className="w-4 h-4 rounded accent-primary cursor-pointer"
                    />
                  </label>
                </div>

                {/* Permission rows */}
                {perms.map((perm, i) => (
                  <motion.label
                    key={perm.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    className="flex items-center gap-4 px-6 py-3.5 hover:bg-surface-container-high/30 cursor-pointer transition-colors group"
                  >
                    <input
                      type="checkbox"
                      checked={matrix[activeRole].has(perm.id)}
                      onChange={() => toggle(activeRole, perm.id)}
                      className="w-4 h-4 rounded accent-primary cursor-pointer shrink-0"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-on-surface">{perm.label}</div>
                      <div className="text-xs text-on-surface-variant mt-0.5">{perm.description}</div>
                    </div>
                    <code className="text-xs font-mono text-on-surface-variant/40 shrink-0 hidden group-hover:inline">{perm.id}</code>
                  </motion.label>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Info note */}
      <div className="flex items-start gap-3 p-4 bg-primary/5 border border-primary/10 rounded-xl text-xs text-on-surface-variant">
        <Icons.ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <p>
          Konfigurasi RBAC ini disimpan secara lokal di browser. Untuk enforcement di server, integrasikan dengan Supabase Row Level Security (RLS) policies sesuai role yang telah dikonfigurasi.
        </p>
      </div>
    </div>
  );
}
