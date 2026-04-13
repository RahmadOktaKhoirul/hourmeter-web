import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils';
import { Icons } from '../lib/icons';
import type { AppUser } from '../lib/supabase';

const navItems = [
  { icon: Icons.Dashboard, label: 'Dashboard', path: '/' },
  { icon: Icons.Machines, label: 'Machines', path: '/machines' },
  { icon: Icons.BusinessUnits, label: 'Business Units', path: '/business-units' },
  { icon: Icons.Users, label: 'Users & Roles', path: '/users' },
  { icon: Icons.Reports, label: 'Reports', path: '/reports' },
  { icon: Icons.Settings, label: 'Settings', path: '/settings' },
];

export default function Sidebar({ onLogout }: { onLogout: () => void }) {
  return (
    <aside className="hidden md:flex flex-col w-64 bg-primary dark:bg-surface-container-low border-r border-primary/20 dark:border-outline-variant/10 py-6 px-4 shrink-0">
      <div className="px-2 mb-10">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-on-primary dark:bg-primary flex items-center justify-center">
            <Icons.Machines className="w-6 h-6 text-primary dark:text-on-primary" />
          </div>
          <h1 className="text-xl font-black font-headline tracking-tighter text-on-primary dark:text-on-surface">HM GGF</h1>
        </div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-on-primary/70 dark:text-on-surface-variant font-medium opacity-70">
          Kinetic Ledger
        </p>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group",
              isActive
                ? "bg-on-primary/20 dark:bg-primary-container/10 text-on-primary dark:text-primary border-l-4 border-on-primary dark:border-primary"
                : "text-on-primary/70 dark:text-on-surface-variant hover:bg-on-primary/10 dark:hover:bg-surface-container-highest hover:text-on-primary dark:hover:text-on-surface"
            )}
          >
            <item.icon className="w-5 h-5 transition-colors group-hover:text-on-primary dark:group-hover:text-primary" />
            <span className="font-medium tracking-tight">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="pt-6 border-t border-on-primary/20 dark:border-outline-variant/10 space-y-1">
        <NavLink
          to="/support"
          className="flex items-center gap-3 px-4 py-3 text-on-primary/70 dark:text-on-surface-variant hover:bg-on-primary/10 dark:hover:bg-surface-container-highest hover:text-on-primary dark:hover:text-on-surface rounded-xl transition-all group"
        >
          <Icons.Support className="w-5 h-5 group-hover:text-on-primary dark:group-hover:text-primary transition-colors" />
          <span className="font-medium tracking-tight">Support</span>
        </NavLink>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 text-on-primary/70 dark:text-on-surface-variant hover:bg-on-primary/10 dark:hover:bg-surface-container-highest hover:text-on-primary dark:hover:text-on-surface rounded-xl transition-all group"
        >
          <Icons.Logout className="w-5 h-5 group-hover:text-on-primary dark:group-hover:text-primary transition-colors" />
          <span className="font-medium tracking-tight">Logout</span>
        </button>
      </div>
    </aside>
  );
}
