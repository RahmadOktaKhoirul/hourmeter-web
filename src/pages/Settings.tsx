import { useState } from 'react';
import { Icons } from '../lib/icons';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

type Toast = { type: 'success' | 'error'; message: string };

function ToastBanner({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  return (
    <div className={cn(
      'flex items-center gap-3 p-4 rounded-2xl text-sm font-medium border',
      toast.type === 'success'
        ? 'bg-primary/10 border-primary/20 text-primary'
        : 'bg-error/10 border-error/20 text-error'
    )}>
      {toast.type === 'success'
        ? <Icons.CheckCircle2 className="w-4 h-4 shrink-0" />
        : <Icons.AlertTriangle className="w-4 h-4 shrink-0" />}
      <span className="flex-1">{toast.message}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 transition-opacity ml-2 font-bold">✕</button>
    </div>
  );
}

interface SettingsProps {
  darkMode: boolean;
  onToggleDark: () => void;
}

const tabs = ['General', 'Security', 'Notifications', 'Integrations', 'Billing'] as const;
type Tab = typeof tabs[number];

export default function Settings({ darkMode, onToggleDark }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>('General');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [language, setLanguage] = useState('English (US)');
  const [timezone, setTimezone] = useState('UTC +07:00 (Jakarta)');
  const [toast, setToast] = useState<Toast | null>(null);

  function showToast(type: Toast['type'], message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSave() {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600)); // simulate save
    setSaving(false);
    setSaved(true);
    showToast('success', 'Settings saved successfully.');
    setTimeout(() => setSaved(false), 2000);
  }

  async function handlePurgeLogs() {
    if (!confirm('This will permanently delete ALL telemetry logs. Are you sure?')) return;
    const { error } = await supabase
      .from('telemetry_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      showToast('error', `Gagal menghapus logs: ${error.message}`);
    } else {
      showToast('success', 'All telemetry logs have been purged.');
    }
  }

  async function handleDeactivateUnit() {
    if (!confirm('This will set ALL business units to Inactive. Are you sure?')) return;
    const { error } = await supabase
      .from('business_units')
      .update({ status: 'Inactive' })
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      showToast('error', `Gagal menonaktifkan units: ${error.message}`);
    } else {
      showToast('success', 'All business units have been deactivated.');
    }
  }

  return (
    <div className="space-y-10">
      {toast && <ToastBanner toast={toast} onClose={() => setToast(null)} />}
      <div>
        <h2 className="text-4xl font-black font-headline tracking-tighter text-on-surface">Settings</h2>
        <p className="text-on-surface-variant font-medium tracking-widest uppercase opacity-70 mt-1">System configuration and preferences</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Tab nav */}
        <div className="lg:col-span-4 space-y-2">
          {tabs.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn('w-full text-left px-6 py-4 rounded-2xl text-sm font-bold uppercase tracking-widest transition-all',
                activeTab === tab ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              )}>
              {tab}
            </button>
          ))}
        </div>

        <div className="lg:col-span-8 space-y-8">
          {/* GENERAL */}
          {activeTab === 'General' && (
            <>
              <section className="bg-surface-container-low p-10 rounded-3xl border border-outline-variant/10 space-y-8">
                <h3 className="text-2xl font-headline font-bold text-on-surface tracking-tight border-b border-outline-variant/10 pb-6">General Configuration</h3>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">System Language</label>
                      <div className="relative">
                        <Icons.Languages className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                        <select value={language} onChange={e => setLanguage(e.target.value)}
                          className="w-full bg-surface-container-high border border-outline-variant/20 rounded-xl py-3 pl-12 pr-4 text-sm font-medium text-on-surface focus:ring-2 focus:ring-primary/40 outline-none appearance-none">
                          <option>English (US)</option>
                          <option>Bahasa Indonesia</option>
                          <option>Deutsch</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Time Zone</label>
                      <div className="relative">
                        <Icons.Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                        <select value={timezone} onChange={e => setTimezone(e.target.value)}
                          className="w-full bg-surface-container-high border border-outline-variant/20 rounded-xl py-3 pl-12 pr-4 text-sm font-medium text-on-surface focus:ring-2 focus:ring-primary/40 outline-none appearance-none">
                          <option>UTC +07:00 (Jakarta)</option>
                          <option>UTC +00:00 (GMT)</option>
                          <option>UTC -05:00 (EST)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4">
                    {/* Dark Mode toggle — terhubung ke App state */}
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-container-high/30">
                      <div>
                        <p className="text-sm font-bold text-on-surface">Dark Mode</p>
                        <p className="text-xs text-on-surface-variant">Adjust system appearance for low light</p>
                      </div>
                      <button onClick={onToggleDark}
                        className={cn('w-12 h-7 rounded-full relative transition-colors duration-300', darkMode ? 'bg-primary' : 'bg-surface-container-highest')}>
                        <div className={cn('absolute top-1 w-5 h-5 bg-on-primary rounded-full shadow-sm transition-all duration-300', darkMode ? 'right-1' : 'left-1 bg-on-surface-variant')} />
                      </button>
                    </div>

                    {/* Auto-refresh toggle */}
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-container-high/30">
                      <div>
                        <p className="text-sm font-bold text-on-surface">Auto-Refresh Telemetry</p>
                        <p className="text-xs text-on-surface-variant">Update dashboard data every 30 seconds</p>
                      </div>
                      <button onClick={() => setAutoRefresh(v => !v)}
                        className={cn('w-12 h-7 rounded-full relative transition-colors duration-300', autoRefresh ? 'bg-primary' : 'bg-surface-container-highest')}>
                        <div className={cn('absolute top-1 w-5 h-5 rounded-full shadow-sm transition-all duration-300', autoRefresh ? 'right-1 bg-on-primary' : 'left-1 bg-on-surface-variant')} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-outline-variant/10 flex justify-end gap-4">
                  <button onClick={() => { setLanguage('English (US)'); setTimezone('UTC +07:00 (Jakarta)'); }}
                    className="px-6 py-3 text-xs font-bold uppercase tracking-widest text-on-surface-variant hover:text-on-surface transition-colors">Discard</button>
                  <button onClick={handleSave} disabled={saving}
                    className={cn('px-8 py-3 font-bold rounded-xl text-xs uppercase tracking-widest shadow-lg shadow-primary/10 hover:opacity-90 transition-all disabled:opacity-60',
                      saved ? 'bg-primary/20 text-primary' : 'bg-primary text-on-primary'
                    )}>
                    {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save Changes'}
                  </button>
                </div>
              </section>

              <section className="bg-error/5 p-10 rounded-3xl border border-error/10 space-y-6">
                <h3 className="text-xl font-headline font-bold text-error tracking-tight">Danger Zone</h3>
                <p className="text-sm text-on-surface-variant">Irreversible actions for the entire system.</p>
                <div className="flex flex-wrap gap-4">
                  <button onClick={handlePurgeLogs} className="px-6 py-3 border border-error/20 text-error font-bold rounded-xl text-xs uppercase tracking-widest hover:bg-error/10 transition-all">
                    Purge Telemetry Logs
                  </button>
                  <button onClick={handleDeactivateUnit} className="px-6 py-3 bg-error text-on-error font-bold rounded-xl text-xs uppercase tracking-widest hover:opacity-90 transition-all">
                    Deactivate All Units
                  </button>
                </div>
              </section>
            </>
          )}

          {/* SECURITY */}
          {activeTab === 'Security' && (
            <section className="bg-surface-container-low p-10 rounded-3xl border border-outline-variant/10 space-y-8">
              <h3 className="text-2xl font-headline font-bold text-on-surface tracking-tight border-b border-outline-variant/10 pb-6">Security Settings</h3>
              <div className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-container-high/30">
                  <div>
                    <p className="text-sm font-bold text-on-surface">Two-Factor Authentication</p>
                    <p className="text-xs text-on-surface-variant">Require 2FA for all users</p>
                  </div>
                  <span className="text-[10px] font-bold px-3 py-1 rounded-full bg-error/10 text-error uppercase tracking-widest">Disabled</span>
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-container-high/30">
                  <div>
                    <p className="text-sm font-bold text-on-surface">Session Timeout</p>
                    <p className="text-xs text-on-surface-variant">Auto-logout after inactivity</p>
                  </div>
                  <select className="bg-surface-container-high border border-outline-variant/20 rounded-xl px-4 py-2 text-sm text-on-surface outline-none">
                    <option>30 minutes</option><option>1 hour</option><option>4 hours</option><option>Never</option>
                  </select>
                </div>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-surface-container-high/30">
                  <div>
                    <p className="text-sm font-bold text-on-surface">Audit Logging</p>
                    <p className="text-xs text-on-surface-variant">Log all user actions</p>
                  </div>
                  <div className="w-12 h-7 bg-primary rounded-full relative cursor-pointer">
                    <div className="absolute right-1 top-1 w-5 h-5 bg-on-primary rounded-full shadow-sm" />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* NOTIFICATIONS */}
          {activeTab === 'Notifications' && (
            <section className="bg-surface-container-low p-10 rounded-3xl border border-outline-variant/10 space-y-8">
              <h3 className="text-2xl font-headline font-bold text-on-surface tracking-tight border-b border-outline-variant/10 pb-6">Notification Preferences</h3>
              <div className="space-y-4">
                {[
                  { label: 'Service Overdue Alerts', desc: 'Notify when a machine is overdue for service', on: true },
                  { label: 'Machine Status Changes', desc: 'Notify on RUNNING / STOPPED transitions', on: true },
                  { label: 'New User Invitations', desc: 'Notify when a new user joins', on: false },
                  { label: 'Weekly Report Ready', desc: 'Notify when scheduled report is generated', on: true },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between p-4 rounded-2xl bg-surface-container-high/30">
                    <div>
                      <p className="text-sm font-bold text-on-surface">{item.label}</p>
                      <p className="text-xs text-on-surface-variant">{item.desc}</p>
                    </div>
                    <div className={cn('w-12 h-7 rounded-full relative cursor-pointer', item.on ? 'bg-primary' : 'bg-surface-container-highest')}>
                      <div className={cn('absolute top-1 w-5 h-5 rounded-full shadow-sm', item.on ? 'right-1 bg-on-primary' : 'left-1 bg-on-surface-variant')} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* INTEGRATIONS */}
          {activeTab === 'Integrations' && (
            <section className="bg-surface-container-low p-10 rounded-3xl border border-outline-variant/10 space-y-8">
              <h3 className="text-2xl font-headline font-bold text-on-surface tracking-tight border-b border-outline-variant/10 pb-6">Integrations</h3>
              <div className="space-y-4">
                {[
                  { name: 'Supabase', desc: 'Database & Auth', icon: Icons.Database, connected: true },
                  { name: 'Google AI (Gemini)', desc: 'AI-powered insights', icon: Icons.Zap, connected: true },
                  { name: 'Cloud Storage', desc: 'Report file storage', icon: Icons.Cloud, connected: false },
                ].map(item => (
                  <div key={item.name} className="flex items-center justify-between p-6 rounded-2xl bg-surface-container-high/30 border border-outline-variant/10">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center">
                        <item.icon className="w-5 h-5 text-on-surface-variant" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-on-surface">{item.name}</p>
                        <p className="text-xs text-on-surface-variant">{item.desc}</p>
                      </div>
                    </div>
                    <span className={cn('text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest',
                      item.connected ? 'bg-primary/10 text-primary' : 'bg-surface-container-highest text-on-surface-variant'
                    )}>{item.connected ? 'Connected' : 'Not Connected'}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* BILLING */}
          {activeTab === 'Billing' && (
            <section className="bg-surface-container-low p-10 rounded-3xl border border-outline-variant/10 space-y-8">
              <h3 className="text-2xl font-headline font-bold text-on-surface tracking-tight border-b border-outline-variant/10 pb-6">Billing & Plan</h3>
              <div className="p-6 rounded-2xl bg-primary/10 border border-primary/20">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Current Plan</p>
                <p className="text-3xl font-headline font-bold text-on-surface">Enterprise</p>
                <p className="text-sm text-on-surface-variant mt-1">Unlimited machines · All features · Priority support</p>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm py-3 border-b border-outline-variant/10">
                  <span className="text-on-surface-variant">Next billing date</span>
                  <span className="font-bold text-on-surface">September 1, 2025</span>
                </div>
                <div className="flex justify-between text-sm py-3 border-b border-outline-variant/10">
                  <span className="text-on-surface-variant">Active users</span>
                  <span className="font-bold text-on-surface">4 / Unlimited</span>
                </div>
                <div className="flex justify-between text-sm py-3">
                  <span className="text-on-surface-variant">Machines tracked</span>
                  <span className="font-bold text-on-surface">6 / Unlimited</span>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
