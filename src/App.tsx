/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import type { AppUser } from './lib/supabase';
import { can } from './lib/rbac';

import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';

import Dashboard from './pages/Dashboard';
import Machines from './pages/Machines';
import BusinessUnits from './pages/BusinessUnits';
import Users from './pages/Users';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Login from './pages/Login';
import MasterUnits from './pages/master/MasterUnits';
import MasterUsers from './pages/master/MasterUsers';
import ServiceSchedule from './pages/master/ServiceSchedule';
import RBAC from './pages/master/RBAC';

// ── Halaman yang dilindungi permission tertentu ───────────────
function ProtectedRoute({
  permId,
  children,
  user,
}: {
  permId: string;
  children: React.ReactNode;
  user: AppUser;
}) {
  if (!can(user.role, permId)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

// ── Layout utama setelah login ────────────────────────────────
function Layout({
  children, user, onLogout, darkMode, onToggleDark,
}: {
  children: React.ReactNode;
  user: AppUser;
  onLogout: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
}) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Tutup drawer otomatis saat route berubah
  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <Sidebar
        onLogout={onLogout}
        userRole={user.role}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          user={user}
          darkMode={darkMode}
          onToggleDark={onToggleDark}
          onMenuOpen={() => setMobileMenuOpen(true)}
        />
        <main className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="p-6 md:p-8 max-w-7xl mx-auto w-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

// ── Inner router — pakai useNavigate untuk redirect setelah login ─
function AppRoutes({
  user,
  onLogin,
  onLogout,
  darkMode,
  onToggleDark,
}: {
  user: AppUser | null;
  onLogin: (u: AppUser) => void;
  onLogout: () => void;
  darkMode: boolean;
  onToggleDark: () => void;
}) {
  const navigate = useNavigate();

  function handleLogin(u: AppUser) {
    onLogin(u);
    // Selalu kembali ke Home setelah login
    navigate('/', { replace: true });
  }

  function handleLogout() {
    onLogout();
    // Kembali ke root agar Login tampil bersih
    navigate('/', { replace: true });
  }

  if (!user) {
    return (
      <Login
        onLogin={handleLogin}
        darkMode={darkMode}
        onToggleDark={onToggleDark}
      />
    );
  }

  return (
    <Layout
      user={user}
      onLogout={handleLogout}
      darkMode={darkMode}
      onToggleDark={onToggleDark}
    >
      <Routes>
        {/* ── Main routes ─────────────────────────────── */}
        <Route path="/" element={
          <ProtectedRoute permId="dashboard.view" user={user}>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/machines" element={
          <ProtectedRoute permId="machines.view" user={user}>
            <Machines />
          </ProtectedRoute>
        } />
        <Route path="/business-units" element={<BusinessUnits />} />
        <Route path="/users" element={<Users />} />
        <Route path="/reports" element={
          <ProtectedRoute permId="reports.view" user={user}>
            <Reports />
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute permId="settings.view" user={user}>
            <Settings darkMode={darkMode} onToggleDark={onToggleDark} />
          </ProtectedRoute>
        } />

        {/* ── Master routes ────────────────────────────── */}
        <Route path="/master/units" element={
          <ProtectedRoute permId="master.units" user={user}>
            <MasterUnits />
          </ProtectedRoute>
        } />
        <Route path="/master/users" element={
          <ProtectedRoute permId="master.users" user={user}>
            <MasterUsers />
          </ProtectedRoute>
        } />
        <Route path="/master/service-schedule" element={
          <ProtectedRoute permId="master.service" user={user}>
            <ServiceSchedule />
          </ProtectedRoute>
        } />
        <Route path="/master/rbac" element={
          <ProtectedRoute permId="master.rbac" user={user}>
            <RBAC />
          </ProtectedRoute>
        } />

        {/* ── Fallback ─────────────────────────────────── */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

// ── Root App ──────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState<AppUser | null>(() => {
    const saved = localStorage.getItem('hm_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    if (user) localStorage.setItem('hm_user', JSON.stringify(user));
    else localStorage.removeItem('hm_user');
  }, [user]);

  return (
    <div className={darkMode ? 'dark' : ''}>
      <Router>
        <AppRoutes
          user={user}
          onLogin={setUser}
          onLogout={() => setUser(null)}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode(d => !d)}
        />
      </Router>
    </div>
  );
}
