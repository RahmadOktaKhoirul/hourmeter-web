import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Icons } from '../lib/icons';
import { can, type Role } from '../lib/rbac';

// ── Definisi nav dengan permission masing-masing ─────────────
const mainNavItems = [
  { icon: Icons.Dashboard,     label: 'Dashboard',      path: '/',               permission: 'dashboard.view' },
  { icon: Icons.Machines,      label: 'Machines',       path: '/machines',       permission: 'machines.view' },
  { icon: Icons.BusinessUnits, label: 'Business Units', path: '/business-units', permission: null },
  { icon: Icons.Reports,       label: 'Reports',        path: '/reports',        permission: 'reports.view' },
] as const;

const masterNavItems = [
  { icon: Icons.Shield,   label: 'RBAC',            path: '/master/rbac',             permission: 'master.rbac' },
  { icon: Icons.Calendar, label: 'Service Schedule', path: '/master/service-schedule', permission: 'master.service' },
  { icon: Icons.Machines, label: 'Unit / Machine',   path: '/master/units',            permission: 'master.units' },
  { icon: Icons.Users,    label: 'User & Role',      path: '/master/users',            permission: 'master.users' },
] as const;

interface SidebarProps {
  onLogout: () => void;
  userRole: Role;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function SidebarContent({
  onLogout,
  userRole,
  onClose,
}: {
  onLogout: () => void;
  userRole: Role;
  onClose?: () => void;
}) {
  const location = useLocation();

  // Filter master items yang boleh diakses role ini
  const visibleMasterItems = masterNavItems.filter(i => can(userRole, i.permission));
  const showMasterGroup = can(userRole, 'master.view') && visibleMasterItems.length > 0;
  const isMasterActive = visibleMasterItems.some(i => location.pathname.startsWith(i.path));
  const [masterOpen, setMasterOpen] = useState(isMasterActive);

  // Filter main nav items
  const visibleMainItems = mainNavItems.filter(i => i.permission === null || can(userRole, i.permission));

  return (
    <>
      {/* Logo */}
      <div className="px-2 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-on-primary/15 dark:bg-primary/20 flex items-center justify-center shrink-0">
            <Icons.Machines className="w-5 h-5 text-on-primary dark:text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-on-primary dark:text-on-surface leading-tight">HM GGF</h1>
            <p className="text-xs text-on-primary/50 dark:text-on-surface-variant leading-tight">Fleet Hour Meter</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto">
        {/* Main nav — hanya item yang boleh diakses */}
        {visibleMainItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={onClose}
            end={item.path === '/'}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group',
              isActive
                ? 'bg-on-primary/20 dark:bg-primary/10 text-on-primary dark:text-primary font-semibold'
                : 'text-on-primary/70 dark:text-on-surface-variant hover:bg-on-primary/10 dark:hover:bg-surface-container-high hover:text-on-primary dark:hover:text-on-surface'
            )}
          >
            <item.icon className="w-4.5 h-4.5 shrink-0 transition-colors" />
            <span className="text-sm">{item.label}</span>
          </NavLink>
        ))}

        {/* Master group */}
        {showMasterGroup && (
          <div className="pt-3">
            <p className="px-3 mb-1 text-xs font-semibold text-on-primary/40 dark:text-on-surface-variant/50 uppercase tracking-wider">Master</p>
            <button
              onClick={() => setMasterOpen(v => !v)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                isMasterActive
                  ? 'text-on-primary dark:text-primary font-semibold'
                  : 'text-on-primary/70 dark:text-on-surface-variant hover:bg-on-primary/10 dark:hover:bg-surface-container-high hover:text-on-primary dark:hover:text-on-surface'
              )}
            >
              <Icons.List className="w-4.5 h-4.5 shrink-0" />
              <span className="text-sm flex-1 text-left">Data Master</span>
              <Icons.ChevronDown className={cn(
                'w-3.5 h-3.5 transition-transform duration-200',
                masterOpen ? 'rotate-180' : ''
              )} />
            </button>

            <AnimatePresence initial={false}>
              {masterOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="ml-3 pl-3 border-l border-on-primary/15 dark:border-outline-variant/20 mt-0.5 space-y-0.5">
                    {visibleMasterItems.map((item) => (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={onClose}
                        className={({ isActive }) => cn(
                          'flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 text-sm',
                          isActive
                            ? 'bg-on-primary/20 dark:bg-primary/10 text-on-primary dark:text-primary font-semibold'
                            : 'text-on-primary/60 dark:text-on-surface-variant hover:bg-on-primary/10 dark:hover:bg-surface-container-high hover:text-on-primary dark:hover:text-on-surface'
                        )}
                      >
                        <item.icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </nav>

      {/* Bottom */}
      <div className="pt-6 border-t border-on-primary/20 dark:border-outline-variant/10 space-y-1">
        {can(userRole, 'settings.view') && (
          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-4 py-3 rounded-xl transition-all group',
              isActive
                ? 'bg-on-primary/20 dark:bg-primary/10 text-on-primary dark:text-primary border-l-4 border-on-primary dark:border-primary'
                : 'text-on-primary/70 dark:text-on-surface-variant hover:bg-on-primary/10 dark:hover:bg-surface-container-highest hover:text-on-primary dark:hover:text-on-surface'
            )}
          >
            <Icons.Settings className="w-5 h-5 group-hover:text-on-primary dark:group-hover:text-primary transition-colors" />
            <span className="font-medium tracking-tight">Settings</span>
          </NavLink>
        )}
        <button
          onClick={() => { onClose?.(); onLogout(); }}
          className="w-full flex items-center gap-3 px-4 py-3 text-on-primary/70 dark:text-on-surface-variant hover:bg-on-primary/10 dark:hover:bg-surface-container-highest hover:text-on-primary dark:hover:text-on-surface rounded-xl transition-all group"
        >
          <Icons.Logout className="w-5 h-5 group-hover:text-on-primary dark:group-hover:text-primary transition-colors" />
          <span className="font-medium tracking-tight">Logout</span>
        </button>
      </div>
    </>
  );
}

export default function Sidebar({ onLogout, userRole, mobileOpen = false, onMobileClose }: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-primary dark:bg-surface-container-low border-r border-primary/20 dark:border-outline-variant/10 py-6 px-4 shrink-0">
        <SidebarContent onLogout={onLogout} userRole={userRole} />
      </aside>

      {/* Mobile sidebar — drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
              onClick={onMobileClose}
            />
            <motion.aside
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="fixed inset-y-0 left-0 z-50 flex flex-col w-72 bg-primary dark:bg-surface-container-low py-6 px-4 md:hidden shadow-2xl"
            >
              <button
                onClick={onMobileClose}
                className="absolute top-4 right-4 p-2 rounded-xl text-on-primary/70 hover:bg-on-primary/10 transition-all"
                aria-label="Close navigation menu"
              >
                <Icons.X className="w-5 h-5" />
              </button>
              <SidebarContent onLogout={onLogout} userRole={userRole} onClose={onMobileClose} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
