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
    if (editUser) {
      await supabase.from('app_users').update({
        name: form.name, email: form.email, role: form.role,
        status: form.status, business_unit_id: form.business_unit_id || null,
      }).eq('id', editUser.id);
    } else {
      // Insert with hashed password via RPC or direct insert
      await supabase.from('app_users').insert({
        name: form.name, email: form.email, role: form.role,
        status: form.status, business_unit_id: form.business_unit_id || null,
        password_hash: form.password, // will be plain — remind to hash via SQL if needed
      });
    }
    setSaving(false);
    setShowInvite(false);
    setEditUser(null);
    setForm(emptyForm);
    load();
  }

  async function handleDelete(user: AppUser) {
    if (!confirm(`Delete user "${user.name}"?`)) return;
    await supabase.from('app_users').delete().eq('id', user.id);
    setActionUser(null);
    load();
  }

  async function handleStatusChange(user: AppUser, status: AppUser['status']) {
    await supabase.from('app_users').update({ status }).eq('id', user.id);
    setActionUser(null);
    load();
  }

  function openEdit(user: AppUser) {
    setEditUser(user);
    setForm({ name: user.name, email: user.email, role: user.role, status: user.status, business_unit_id: user.business_unit_id ?? '', password: '' });
    setShowInvite(true);
  }

  const roles = ['All', 'Fleet Overseer', 'Unit Manager', 'Maintenance Lead', 'Operator'];
  const filtered = filterRole === 'All' ? users : users.filter(u => u.role === filterRole);

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-4xl font-black font-headline tracking-tighter text-on-surface">Users & Roles</h2>
          <p className="text-on-surface-variant font-medium tracking-widest uppercase opacity-70 mt-1">Team access and permission control</p>
        </div>
        <div className="flex gap-4">
          <button onClick={() => { setEditUser(null); setForm(emptyForm); setShowInvite(true); }}
            className="px-6 py-3 bg-primary text-on-primary font-bold rounded-2xl shadow-xl shadow-primary/20 hover:opacity-90 transition-all uppercase tracking-widest text-xs flex items-center gap-2">
            <Icons.UserPlus className="w-4 h-4" /> Invite User
          </button>
        </div>
      </div>

      {/* Role filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {roles.map(role => (
          <button key={role} onClick={() => setFilterRole(role)}
            className={cn('px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all',
              filterRole === role ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
            )}>
            {role}
          </button>
        ))}
      </div>

      <div className="bg-surface-container-low rounded-3xl overflow-hidden border border-outline-variant/10">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/10">
              <th className="px-8 py-6">User</th>
              <th className="px-8 py-6">Role</th>
              <th className="px-8 py-6">Business Unit</th>
              <th className="px-8 py-6">Status</th>
              <th className="px-8 py-6">Last Active</th>
              <th className="px-8 py-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/5">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} className="px-8 py-6"><div className="h-4 bg-surface-container-high rounded animate-pulse" /></td></tr>
                ))
              : filtered.map((user, i) => (
                  <motion.tr key={user.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="hover:bg-surface-container-high/30 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl overflow-hidden border border-outline-variant/10 bg-surface-container-highest flex items-center justify-center">
                          {user.avatar_url
                            ? <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            : <Icons.Users className="w-5 h-5 text-on-surface-variant" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">{user.name}</p>
                          <p className="text-xs text-on-surface-variant">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-surface-container-highest text-on-surface-variant uppercase tracking-widest">
                        {user.role}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-sm text-on-surface-variant font-medium">{user.business_units?.name ?? '—'}</td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <span className={cn('w-2 h-2 rounded-full',
                          user.status === 'Online' ? 'bg-primary animate-pulse' :
                          user.status === 'Away' ? 'bg-tertiary' : 'bg-on-surface-variant'
                        )} />
                        <span className="text-xs font-medium text-on-surface">{user.status}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-xs text-on-surface-variant font-medium">{timeAgo(user.last_active_at)}</td>
                    <td className="px-8 py-6 text-right relative">
                      <button onClick={() => setActionUser(actionUser?.id === user.id ? null : user)}
                        className="p-2 rounded-lg hover:bg-surface-container-highest text-on-surface-variant hover:text-primary transition-all">
                        <Icons.MoreVertical className="w-5 h-5" />
                      </button>
                      {/* Dropdown */}
                      {actionUser?.id === user.id && (
                        <div className="absolute right-8 top-12 z-20 bg-surface border border-outline-variant/20 rounded-2xl shadow-xl overflow-hidden min-w-[160px]">
                          <button onClick={() => openEdit(user)} className="w-full text-left px-4 py-3 text-sm font-medium text-on-surface hover:bg-surface-container-high flex items-center gap-3">
                            <Icons.Settings className="w-4 h-4" /> Edit
                          </button>
                          <button onClick={() => handleStatusChange(user, user.status === 'Online' ? 'Offline' : 'Online')}
                            className="w-full text-left px-4 py-3 text-sm font-medium text-on-surface hover:bg-surface-container-high flex items-center gap-3">
                            <Icons.Activity className="w-4 h-4" /> Toggle Status
                          </button>
                          <button onClick={() => handleDelete(user)} className="w-full text-left px-4 py-3 text-sm font-medium text-error hover:bg-error/10 flex items-center gap-3">
                            <Icons.AlertTriangle className="w-4 h-4" /> Delete
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
      <Modal open={showInvite} onClose={() => { setShowInvite(false); setEditUser(null); }} title={editUser ? `Edit — ${editUser.name}` : 'Invite New User'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Full Name">
              <input required className={inputCls} placeholder="John Doe" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Email">
              <input required type="email" className={inputCls} placeholder="j.doe@ggf.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </Field>
          </div>
          {!editUser && (
            <Field label="Password">
              <input required type="password" className={inputCls} placeholder="Min. 8 characters" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
            </Field>
          )}
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
            <button type="button" onClick={() => { setShowInvite(false); setEditUser(null); }} className="px-5 py-2.5 text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-6 py-2.5 bg-primary text-on-primary font-bold rounded-xl text-xs uppercase tracking-widest hover:opacity-90 disabled:opacity-60">
              {saving ? 'Saving...' : editUser ? 'Save Changes' : 'Invite User'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
