/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import type { AppUser } from './lib/supabase';

import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';

import Dashboard from './pages/Dashboard';
import Machines from './pages/Machines';
import BusinessUnits from './pages/BusinessUnits';
import Users from './pages/Users';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Login from './pages/Login';

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

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      <Sidebar onLogout={onLogout} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar user={user} darkMode={darkMode} onToggleDark={onToggleDark} />
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

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
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

  if (!user) {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <Login onLogin={setUser} darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} />
      </div>
    );
  }

  return (
    <div className={darkMode ? 'dark' : ''}>
      <Router>
        <Layout user={user} onLogout={() => setUser(null)} darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/machines" element={<Machines />} />
            <Route path="/business-units" element={<BusinessUnits />} />
            <Route path="/users" element={<Users />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings darkMode={darkMode} onToggleDark={() => setDarkMode(d => !d)} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </Router>
    </div>
  );
}
