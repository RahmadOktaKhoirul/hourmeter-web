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
        <div className="absolute -top-[20%] -left-[10%] w-[60%] h-[60%] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] -right-[10%] w-[50%] h-[50%] bg-primary-container/10 rounded-full blur-[100px]" />
        <div className="absolute inset-0 opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
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
            className="mb-4 p-3 bg-surface-container-high rounded-2xl shadow-xl border border-outline-variant/10"
          >
            <Icons.Machines className="w-10 h-10 text-primary" />
          </motion.div>
          <h1 className="text-3xl font-bold font-headline tracking-tighter text-on-surface">HM GGF</h1>
          <p className="text-on-surface-variant text-sm mt-1 uppercase tracking-[0.3em] font-medium opacity-80">
            Kinetic Ledger
          </p>
        </div>

        <section className="bg-surface-container-low p-8 rounded-3xl shadow-2xl border border-outline-variant/10 backdrop-blur-sm">
          <div className="mb-8">
            <h2 className="text-2xl font-bold font-headline text-on-surface tracking-tight">Welcome back</h2>
            <p className="text-on-surface-variant text-sm mt-1">Access your industrial telemetry dashboard.</p>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">
                Professional Email
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-on-surface-variant group-focus-within:text-primary transition-colors">
                  <Icons.Mail className="w-5 h-5" />
                </div>
                <input
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-surface-container-highest border-none rounded-2xl py-4 pl-12 pr-4 text-on-surface font-headline placeholder:text-outline focus:ring-2 focus:ring-primary/40 transition-all outline-none"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-end px-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Secure Password
                </label>
                <a href="#" className="text-[10px] font-bold uppercase tracking-widest text-primary hover:text-primary-fixed-dim transition-colors">
                  Forgot?
                </a>
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-on-surface-variant group-focus-within:text-primary transition-colors">
                  <Icons.Lock className="w-5 h-5" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-surface-container-highest border-none rounded-2xl py-4 pl-12 pr-12 text-on-surface font-headline placeholder:text-outline focus:ring-2 focus:ring-primary/40 transition-all outline-none"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-on-surface-variant hover:text-primary transition-colors"
                >
                  {showPassword ? <Icons.EyeOff className="w-5 h-5" /> : <Icons.Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs font-bold text-error bg-error/10 px-4 py-3 rounded-xl">{error}</p>
            )}

            <div className="flex items-center space-x-3 ml-1">
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="w-5 h-5 rounded-lg bg-surface-container-highest border-none text-primary focus:ring-offset-background focus:ring-primary/40 cursor-pointer"
              />
              <label htmlFor="remember" className="text-sm text-on-surface-variant cursor-pointer select-none font-medium">
                Remember this device
              </label>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className={cn(
                'w-full py-4 bg-primary text-on-primary font-headline font-bold rounded-2xl shadow-[0_0_20px_rgba(84,224,131,0.2)] hover:shadow-[0_0_25px_rgba(84,224,131,0.4)] transition-all flex items-center justify-center space-x-2 group',
                loading && 'opacity-60 cursor-not-allowed'
              )}
            >
              <span>{loading ? 'Authorizing...' : 'Authorize Login'}</span>
              {!loading && <Icons.ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
            </motion.button>
          </form>
        </section>

        <footer className="mt-10 text-center space-y-6">
          <p className="text-on-surface-variant text-xs font-medium">
            Not part of a business unit?{' '}
            <a href="#" className="text-primary font-bold hover:underline">Contact Administrator</a>
          </p>
          <div className="flex justify-center items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] font-headline font-bold text-outline uppercase tracking-[0.2em]">
                System Status: Optimal
              </span>
            </div>
          </div>
        </footer>
      </motion.main>

      <div className="fixed bottom-0 right-0 w-80 h-80 opacity-5 pointer-events-none translate-x-10 translate-y-10">
        <Icons.Factory className="w-full h-full text-on-surface" />
      </div>
    </div>
  );
}
