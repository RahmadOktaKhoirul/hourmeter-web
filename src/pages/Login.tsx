import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Icons } from '../lib/icons';
import { cn } from '../lib/utils';
import { supabase, type AppUser } from '../lib/supabase';

interface LoginProps {
  onLogin: (user: AppUser) => void;
  darkMode: boolean;
  onToggleDark: () => void;
}

export default function Login({ onLogin, darkMode, onToggleDark }: LoginProps) {
  const [showPassword, setShowPassword] = useState(false);
  const savedEmail = localStorage.getItem('hm_remembered_email') ?? '';
  const [email, setEmail] = useState(savedEmail);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(savedEmail !== '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { data, error: rpcError } = await supabase.rpc('verify_user_password', {
      p_email: email,
      p_password: password,
    });

    setLoading(false);

    if (rpcError || !data || data.length === 0) {
      setError('Invalid email or password.');
      return;
    }

    // Update status to Online
    await supabase
      .from('app_users')
      .update({ status: 'Online', last_active_at: new Date().toISOString() })
      .eq('id', data[0].id);

    // Simpan email jika "Remember this device" dicentang
    if (rememberMe) {
      localStorage.setItem('hm_remembered_email', email);
    } else {
      localStorage.removeItem('hm_remembered_email');
    }

    onLogin(data[0] as AppUser);
  }

  return (
    <div className="min-h-screen w-full bg-surface text-on-surface flex flex-col items-center justify-center relative overflow-hidden font-sans">
      {/* Dark mode toggle */}
      <button
        onClick={onToggleDark}
        className="fixed top-4 right-4 z-50 p-2 rounded-xl bg-surface-container-low border border-outline-variant/20 text-on-surface-variant hover:text-primary transition-all"
        title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      >
        {darkMode ? <Icons.Sun className="w-5 h-5" /> : <Icons.Moon className="w-5 h-5" />}
      </button>
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-primary/8 rounded-full blur-[100px]" />
        <div className="absolute top-[40%] -right-[10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[80px]" />
        <div className="absolute bottom-[10%] left-[20%] w-[40%] h-[30%] bg-tertiary/5 rounded-full blur-[80px]" />
      </div>

      <motion.main
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-[420px] px-6"
      >
        <div className="flex flex-col items-center mb-10 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mb-4 w-16 h-16 bg-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/25"
          >
            <Icons.Machines className="w-8 h-8 text-on-primary" />
          </motion.div>
          <h1 className="text-2xl font-bold text-on-surface">HM GGF</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Fleet Hour Meter</p>
        </div>

        <section className="bg-surface-container-low p-7 rounded-2xl shadow-xl shadow-black/5 border border-outline-variant/20">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-on-surface">Masuk</h2>
            <p className="text-sm text-on-surface-variant mt-0.5">Akses dashboard telemetri armada Anda.</p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-on-surface-variant ml-1">
                Email
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-on-surface-variant/60 group-focus-within:text-primary transition-colors">
                  <Icons.Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  placeholder="nama@perusahaan.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-surface-container-high border border-outline-variant/20 rounded-lg py-2.5 pl-10 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all outline-none"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center px-0.5">
                <label className="text-xs font-medium text-on-surface-variant">
                  Password
                </label>
                <a href="#" className="text-xs text-primary hover:underline transition-colors">
                  Lupa password?
                </a>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-on-surface-variant/60 group-focus-within:text-primary transition-colors">
                  <Icons.Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-surface-container-high border border-outline-variant/20 rounded-lg py-2.5 pl-10 pr-10 text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-on-surface-variant/60 hover:text-primary transition-colors"
                >
                  {showPassword ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs text-error bg-error/10 px-3 py-2.5 rounded-lg">{error}</p>
            )}

            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded bg-surface-container-high border-outline-variant/30 text-primary cursor-pointer"
              />
              <label htmlFor="remember" className="text-sm text-on-surface-variant cursor-pointer select-none">
                Ingat perangkat ini
              </label>
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={loading}
              className={cn(
                'w-full py-2.5 bg-primary text-on-primary text-sm font-medium rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-2 group',
                loading && 'opacity-60 cursor-not-allowed'
              )}
            >
              <span>{loading ? 'Memverifikasi...' : 'Masuk'}</span>
              {!loading && <Icons.ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />}
            </motion.button>
          </form>
        </section>

        <footer className="mt-8 text-center space-y-3">
          <p className="text-xs text-on-surface-variant">
            Tidak terdaftar?{' '}
            <a href="#" className="text-primary hover:underline">Hubungi Administrator</a>
          </p>
          <div className="flex justify-center items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-on-surface-variant/60">Status sistem: Normal</span>
          </div>
        </footer>
      </motion.main>

      <div className="fixed bottom-0 right-0 w-80 h-80 opacity-5 pointer-events-none translate-x-10 translate-y-10">
        <Icons.Factory className="w-full h-full text-on-surface" />
      </div>
    </div>
  );
}
