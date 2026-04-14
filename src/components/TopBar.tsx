import { Icons } from '../lib/icons';
import type { AppUser } from '../lib/supabase';

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
    <header className="flex justify-between items-center w-full px-6 h-16 z-50 bg-surface border-b border-outline-variant/20 shrink-0">
      <div className="flex items-center gap-4 flex-1">
        {/* Hamburger button — hanya muncul di mobile */}
        <button
          onClick={onMenuOpen}
          className="md:hidden p-2 rounded-xl text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-all shrink-0"
          aria-label="Open navigation menu"
        >
          <Icons.Menu className="w-5 h-5" />
        </button>
        <div className="relative w-full max-w-md group">
          <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant group-focus-within:text-primary transition-colors" />
          <input
            type="text"
            placeholder="Search machines, units, or logs..."
            className="w-full bg-surface-container border-none rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/40 font-sans placeholder:text-on-surface-variant/50 transition-all outline-none text-on-surface"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 ml-4">
        <button
          onClick={onToggleDark}
          className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-all"
          title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {darkMode
            ? <Icons.Sun className="w-5 h-5" />
            : <Icons.Moon className="w-5 h-5" />}
        </button>

        <button className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container-high hover:text-primary transition-all relative">
          <Icons.Notifications className="w-5 h-5" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(84,224,131,0.6)]" />
        </button>

        <div className="flex items-center gap-3 ml-4 pl-4 border-l border-outline-variant/20">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-on-surface font-headline uppercase tracking-wider">{user.name}</p>
            <p className="text-[10px] text-primary font-medium uppercase tracking-widest opacity-80">{user.role}</p>
          </div>
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-surface-container-highest border border-outline-variant/20 flex items-center justify-center">
            {user.avatar_url
              ? <img src={user.avatar_url} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : <Icons.Users className="w-5 h-5 text-on-surface-variant" />}
          </div>
        </div>
      </div>
    </header>
  );
}
