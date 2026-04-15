import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Icons } from '../lib/icons';
import { cn } from '../lib/utils';
import { supabase, type AppUser, type BusinessUnit } from '../lib/supabase';
import Modal, { Field, inputCls, selectCls } from '../components/Modal';

function timeAgo(dateStr: string | null) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

const emptyForm = { name: '', email: '', role: 'Operator' as AppUser['role'], status: 'Offline' as AppUser['status'], business_unit_id: '', password: '' };

function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-3 p-4 bg-error/10 border border-error/20 rounded-2xl text-sm text-error font-medium">
      <Icons.AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 transition-opacity ml-2 font-bold">✕</button>
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [businessUnits, setBusinessUnits] = useState<BusinessUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [actionUser, setActionUser] = useState<AppUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [filterRole, setFilterRole] = useState<string>('All');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [{ data: u }, { data: bu }] = await Promise.all([
      supabase.from('app_users').select('*, business_units(id, name)').order('created_at'),
      supabase.from('business_units').select('*').order('name'),
    ]);
    if (u) setUsers(u);
    if (bu) setBusinessUnits(bu);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editUser) {
        // Update data user (tanpa password)
        const { error: err } = await supabase.from('app_users').update({
          name: form.name, email: form.email, role: form.role,
          status: form.status, business_unit_id: form.business_unit_id || null,
        }).eq('id', editUser.id);
        if (err) { setError(`Gagal menyimpan user: ${err.message}`); return; }

        // Jika password diisi saat edit, update hash-nya via RPC
        if (form.password) {
          const { error: pwErr } = await supabase.rpc('update_user_password', {
            p_user_id: editUser.id,
            p_new_password: form.password,
          });
          if (pwErr) { setError(`Gagal mengubah password: ${pwErr.message}`); return; }
        }
      } else {
        // Insert user baru — password di-hash bcrypt di sisi server via RPC
        const { error: err } = await supabase.rpc('create_app_user', {
          p_name: form.name,
          p_email: form.email,
          p_role: form.role,
          p_status: form.status,
          p_business_unit_id: form.business_unit_id || null,
          p_password: form.password,
        });
        if (err) { setError(`Gagal menambahkan user: ${err.message}`); return; }
      }
      setShowInvite(false);
      setEditUser(null);
      setForm(emptyForm);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(user: AppUser) {
    if (!confirm(`Delete user "${user.name}"?`)) return;
    setError(null);
    const { error: err } = await supabase.from('app_users').delete().eq('id', user.id);
    if (err) { setError(`Gagal menghapus user: ${err.message}`); return; }
    setActionUser(null);
    await load();
  }

  async function handleStatusChange(user: AppUser, status: AppUser['status']) {
    setError(null);
    const { error: err } = await supabase.from('app_users').update({ status }).eq('id', user.id);
    if (err) { setError(`Gagal mengubah status: ${err.message}`); return; }
    setActionUser(null);
    await load();
  }

  function openEdit(user: AppUser) {
    setEditUser(user);
    setForm({ name: user.name, email: user.email, role: user.role, status: user.status, business_unit_id: user.business_unit_id ?? '', password: '' });
    setShowInvite(true);
  }

  const roles = ['All', 'Fleet Overseer', 'Unit Manager', 'Maintenance Lead', 'Operator'];
  const filtered = filterRole === 'All' ? users : users.filter(u => u.role === filterRole);

  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} onClose={() => setError(null)} />}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-on-surface">Users & Role</h2>
          <p className="text-sm text-on-surface-variant mt-0.5">Manajemen akses tim</p>
        </div>
        <button onClick={() => { setEditUser(null); setForm(emptyForm); setShowInvite(true); }}
          className="px-3 py-1.5 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5">
          <Icons.UserPlus className="w-4 h-4" /> Tambah User
        </button>
      </div>

      {/* Role filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {roles.map(role => (
          <button key={role} onClick={() => setFilterRole(role)}
            className={cn('px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
              filterRole === role ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
            )}>
            {role}
          </button>
        ))}
      </div>

      <div className="bg-surface-container-low rounded-xl overflow-hidden border border-outline-variant/10">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-xs font-medium text-on-surface-variant border-b border-outline-variant/10 bg-surface-container-high/40">
              <th className="px-6 py-3">Pengguna</th>
              <th className="px-6 py-3">Role</th>
              <th className="px-6 py-3">Business Unit</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Terakhir Aktif</th>
              <th className="px-6 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-6 py-4"><div className="h-4 bg-surface-container-high rounded animate-pulse" /></td></tr>
                ))
              : filtered.map((user, i) => (
                  <motion.tr key={user.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}
                    className="hover:bg-surface-container-high/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg overflow-hidden border border-outline-variant/10 bg-surface-container-highest flex items-center justify-center shrink-0">
                          {user.avatar_url
                            ? <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            : <span className="text-xs font-semibold text-on-surface-variant">{user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}</span>}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-on-surface">{user.name}</p>
                          <p className="text-xs text-on-surface-variant">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-surface-container-highest text-on-surface-variant">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant">{user.business_units?.name ?? '—'}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={cn('w-1.5 h-1.5 rounded-full',
                          user.status === 'Online' ? 'bg-primary animate-pulse' :
                          user.status === 'Away' ? 'bg-tertiary' : 'bg-on-surface-variant/40'
                        )} />
                        <span className="text-sm text-on-surface">{user.status}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-on-surface-variant">{timeAgo(user.last_active_at)}</td>
                    <td className="px-6 py-4 text-right relative">
                      <button onClick={() => setActionUser(actionUser?.id === user.id ? null : user)}
                        className="p-1.5 rounded-lg hover:bg-surface-container-highest text-on-surface-variant hover:text-primary transition-colors">
                        <Icons.MoreVertical className="w-4 h-4" />
                      </button>
                      {/* Dropdown */}
                      {actionUser?.id === user.id && (
                        <div className="absolute right-6 top-10 z-20 bg-surface border border-outline-variant/20 rounded-xl shadow-lg overflow-hidden min-w-[160px]">
                          <button onClick={() => openEdit(user)} className="w-full text-left px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-high flex items-center gap-2.5">
                            <Icons.Settings className="w-4 h-4" /> Edit
                          </button>
                          <button onClick={() => handleStatusChange(user, user.status === 'Online' ? 'Offline' : 'Online')}
                            className="w-full text-left px-4 py-2.5 text-sm font-medium text-on-surface hover:bg-surface-container-high flex items-center gap-2.5">
                            <Icons.Activity className="w-4 h-4" /> Toggle Status
                          </button>
                          <button onClick={() => handleDelete(user)} className="w-full text-left px-4 py-2.5 text-sm font-medium text-error hover:bg-error/10 flex items-center gap-2.5">
                            <Icons.AlertTriangle className="w-4 h-4" /> Hapus
                          </button>
                        </div>
                      )}
                    </td>
                  </motion.tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Invite / Edit Modal */}
      <Modal open={showInvite} onClose={() => { setShowInvite(false); setEditUser(null); }} title={editUser ? `Edit — ${editUser.name}` : 'Tambah User Baru'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nama Lengkap">
              <input required className={inputCls} placeholder="Ahmad Fauzi" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Email">
              <input required type="email" className={inputCls} placeholder="ahmad@ggf.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </Field>
          </div>
          <Field label={editUser ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password'}>
            <input
              type="password"
              required={!editUser}
              className={inputCls}
              placeholder={editUser ? 'Kosongkan jika tidak ingin diubah' : 'Min. 8 karakter'}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role">
              <select className={selectCls} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as AppUser['role'] }))}>
                <option>Fleet Overseer</option><option>Unit Manager</option><option>Maintenance Lead</option><option>Operator</option>
              </select>
            </Field>
            <Field label="Status">
              <select className={selectCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as AppUser['status'] }))}>
                <option>Online</option><option>Offline</option><option>Away</option>
              </select>
            </Field>
          </div>
          <Field label="Business Unit">
            <select className={selectCls} value={form.business_unit_id} onChange={e => setForm(f => ({ ...f, business_unit_id: e.target.value }))}>
              <option value="">— None —</option>
              {businessUnits.map(bu => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => { setShowInvite(false); setEditUser(null); }} className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">Batal</button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-60 transition-opacity">
              {saving ? 'Menyimpan...' : editUser ? 'Simpan' : 'Tambah'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
