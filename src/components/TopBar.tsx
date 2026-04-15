import { Icons } from '../lib/icons';
import type { AppUser } from '../lib/supabase';

const roleLabel: Record<AppUser['role'], string> = {
  'Fleet Overseer':   'Fleet Overseer',
  'Unit Manager':     'Unit Manager',
  'Maintenance Lead': 'Maintenance',
  'Operator':         'Operator',
};

export default function TopBar({
  user,
  darkMode,
  onToggleDark,
  onMenuOpen,
}: {
  user: AppUser;
  darkMode: boolean;
  onToggleDark: () => void;
  onMenuOpen?: () => void;
}) {
  return (
    <header className="flex justify-between items-center w-full px-5 h-14 z-50 bg-surface border-b border-outline-variant/20 shrink-0">
      <div className="flex items-center gap-3 flex-1">
        {/* Hamburger — mobile only */}
        <button
          onClick={onMenuOpen}
          className="md:hidden p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all shrink-0"
          aria-label="Open navigation menu"
        >
          <Icons.Menu className="w-5 h-5" />
        </button>

        <div className="relative w-full max-w-sm group">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/50 group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="Cari unit, event, atau log..."
            className="w-full bg-surface-container-low border border-outline-variant/20 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/30 placeholder:text-on-surface-variant/40 transition-all outline-none text-on-surface"
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 ml-4">
        <button
          onClick={onToggleDark}
          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all"
          title={darkMode ? 'Light mode' : 'Dark mode'}
        >
          {darkMode ? <Icons.Sun className="w-4.5 h-4.5" /> : <Icons.Moon className="w-4.5 h-4.5" />}
        </button>

        <button className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all relative">
          <Icons.Notifications className="w-4.5 h-4.5" />
          <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-primary rounded-full" />
        </button>

        <div className="flex items-center gap-2.5 ml-3 pl-3 border-l border-outline-variant/20">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-on-surface leading-tight">{user.name}</p>
            <p className="text-xs text-on-surface-variant mt-0.5">{roleLabel[user.role]}</p>
          </div>
          <div className="w-8 h-8 rounded-lg overflow-hidden bg-surface-container-highest border border-outline-variant/20 flex items-center justify-center shrink-0">
            {user.avatar_url
              ? <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : <span className="text-xs font-semibold text-on-surface-variant">
                  {user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                </span>}
          </div>
        </div>
      </div>
    </header>
  );
}
