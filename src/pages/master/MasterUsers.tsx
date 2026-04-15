import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'motion/react';
import { Icons } from '../../lib/icons';
import { cn } from '../../lib/utils';
import { supabase, type AppUser, type BusinessUnit } from '../../lib/supabase';
import Modal, { Field, inputCls, selectCls } from '../../components/Modal';

const ROLES: AppUser['role'][] = ['Fleet Overseer', 'Unit Manager', 'Maintenance Lead', 'Operator'];
const STATUSES: AppUser['status'][] = ['Online', 'Offline', 'Away'];

const emptyForm = {
  name: '',
  email: '',
  role: 'Operator' as AppUser['role'],
  status: 'Offline' as AppUser['status'],
  business_unit_id: '',
  password: '',
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

const roleColors: Record<AppUser['role'], string> = {
  'Fleet Overseer':   'bg-primary/10 text-primary',
  'Unit Manager':     'bg-tertiary/10 text-tertiary',
  'Maintenance Lead': 'bg-error/10 text-error',
  'Operator':         'bg-surface-container-highest text-on-surface-variant',
};

const statusColors: Record<AppUser['status'], string> = {
  'Online':  'bg-primary/10 text-primary',
  'Away':    'bg-tertiary/10 text-tertiary',
  'Offline': 'bg-surface-container-highest text-on-surface-variant',
};

export default function MasterUsers() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<AppUser | null>(null);
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    const [{ data: u, error: ue }, { data: bu }] = await Promise.all([
      supabase.from('app_users').select('*, business_units(id, name)').order('created_at'),
      supabase.from('business_units').select('*').order('name'),
    ]);
    if (ue) setError(`Gagal memuat data: ${ue.message}`);
    if (u) setUsers(u);
    if (bu) setBusinessUnits(bu);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditTarget(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(user: AppUser) {
    setEditTarget(user);
    setForm({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      business_unit_id: user.business_unit_id ?? '',
      password: '',
    });
    setShowModal(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editTarget) {
        // Update data user
        const { error: err } = await supabase.from('app_users').update({
          name: form.name,
          email: form.email,
          role: form.role,
          status: form.status,
          business_unit_id: form.business_unit_id || null,
        }).eq('id', editTarget.id);
        if (err) { setError(`Gagal menyimpan: ${err.message}`); return; }

        // Update password jika diisi
        if (form.password.trim()) {
          const { error: pe } = await supabase.rpc('update_user_password', {
            p_user_id: editTarget.id,
            p_new_password: form.password,
          });
          if (pe) { setError(`Gagal update password: ${pe.message}`); return; }
        }
      } else {
        if (!form.password.trim()) { setError('Password wajib diisi untuk user baru.'); return; }
        const { error: err } = await supabase.rpc('create_app_user', {
          p_name: form.name,
          p_email: form.email,
          p_role: form.role,
          p_status: form.status,
          p_business_unit_id: form.business_unit_id || null,
          p_password: form.password,
        });
        if (err) { setError(`Gagal menambahkan: ${err.message}`); return; }
      }
      setShowModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user: AppUser) {
    if (!confirm(`Hapus user "${user.name} (${user.email})"?`)) return;
    setError(null);
    const { error: err } = await supabase.from('app_users').delete().eq('id', user.id);
    if (err) { setError(`Gagal menghapus: ${err.message}`); return; }
    await load();
  }

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase()) ||
    (u.business_units?.name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-on-surface">User & Role</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Manajemen pengguna — {users.length} akun terdaftar
          </p>
        </div>
        <button onClick={openAdd}
          className="px-3 py-1.5 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5">
          <Icons.Plus className="w-4 h-4" /> Tambah User
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
        <input
          type="text"
          placeholder="Cari nama, email, role..."
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
                <th className="px-6 py-4">Nama</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Business Unit</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-on-surface-variant">Bergabung</th>
                <th className="px-6 py-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={7} className="px-6 py-4">
                      <div className="h-4 bg-surface-container-high rounded animate-pulse" />
                    </td></tr>
                  ))
                : filtered.length === 0
                  ? <tr><td colSpan={7} className="px-6 py-10 text-center text-sm text-on-surface-variant">
                      {search ? 'Tidak ada user yang cocok.' : 'Belum ada user.'}
                    </td></tr>
                  : filtered.map((u, i) => (
                      <motion.tr key={u.id}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
                        className="hover:bg-surface-container-high/40 transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-primary">
                                {u.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                              </span>
                            </div>
                            <span className="font-medium text-sm text-on-surface">{u.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-on-surface-variant">{u.email}</td>
                        <td className="px-6 py-4">
                          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-md', roleColors[u.role])}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-on-surface-variant">{u.business_units?.name ?? '—'}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={cn('text-xs font-medium px-2 py-0.5 rounded-md', statusColors[u.status])}>
                            {u.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs text-on-surface-variant">
                          {new Date(u.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button onClick={() => openEdit(u)}
                              className="p-1.5 rounded-lg text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors"
                              title="Edit">
                              <Icons.Settings className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(u)}
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
        title={editTarget ? `Edit — ${editTarget.name}` : 'Tambah User Baru'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nama Lengkap">
              <input required className={inputCls} placeholder="Ahmad Fauzi"
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Email">
              <input required type="email" className={inputCls} placeholder="user@ggf.com"
                value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role">
              <select className={selectCls} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as AppUser['role'] }))}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select className={selectCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as AppUser['status'] }))}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Business Unit">
            <select className={selectCls} value={form.business_unit_id} onChange={e => setForm(f => ({ ...f, business_unit_id: e.target.value }))}>
              <option value="">— None —</option>
              {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
            </select>
          </Field>
          <Field label={editTarget ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password'}>
            <input
              type="password"
              className={inputCls}
              placeholder={editTarget ? '••••••••' : 'Min. 8 karakter'}
              required={!editTarget}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            />
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
