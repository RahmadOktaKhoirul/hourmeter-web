import type { AppUser } from './supabase';

export type Role = AppUser['role'];

// ── Semua permission yang tersedia ────────────────────────────
export const ALL_PERMISSIONS = [
  'dashboard.view', 'dashboard.realtime',
  'machines.view', 'machines.edit', 'machines.delete', 'machines.shift',
  'reports.view', 'reports.create', 'reports.delete', 'reports.export',
  'master.view', 'master.units', 'master.users', 'master.service', 'master.rbac',
  'settings.view', 'settings.edit',
] as const;

export type PermissionId = typeof ALL_PERMISSIONS[number];

// ── Default matrix — fallback jika belum dikonfigurasi di RBAC ─
export const DEFAULT_MATRIX: Record<Role, PermissionId[]> = {
  'Fleet Overseer': [...ALL_PERMISSIONS],

  'Unit Manager': [
    'dashboard.view', 'dashboard.realtime',
    'machines.view', 'machines.edit', 'machines.shift',
    'reports.view', 'reports.create', 'reports.export',
    'master.view', 'master.units', 'master.service',
    'settings.view',
  ],

  'Maintenance Lead': [
    'dashboard.view', 'dashboard.realtime',
    'machines.view', 'machines.edit', 'machines.shift',
    'reports.view', 'reports.export',
    'master.view', 'master.service',
    'settings.view',
  ],

  'Operator': [
    'dashboard.view',
    'machines.view', 'machines.shift',
    'reports.view',
    'settings.view',
  ],
};

// ── Ambil set permission untuk role tertentu ──────────────────
// Prioritas: localStorage (konfigurasi RBAC) → DEFAULT_MATRIX
export function getPermissions(role: Role): Set<string> {
  try {
    const saved = localStorage.getItem('hm_rbac_matrix');
    if (saved) {
      const parsed = JSON.parse(saved) as Record<string, string[]>;
      if (parsed[role] && parsed[role].length > 0) {
        return new Set(parsed[role]);
      }
    }
  } catch { /* fallback ke default */ }
  return new Set(DEFAULT_MATRIX[role] ?? []);
}

// ── Cek apakah role memiliki permission tertentu ──────────────
export function can(role: Role | null | undefined, permId: string): boolean {
  if (!role) return false;
  return getPermissions(role).has(permId);
}

// ── Ambil role user yang sedang login dari localStorage ───────
export function getCurrentUserRole(): Role | null {
  try {
    const saved = localStorage.getItem('hm_user');
    if (saved) return (JSON.parse(saved) as AppUser).role ?? null;
  } catch { /* ignore */ }
  return null;
}

// ── Cek permission user yang sedang login ─────────────────────
export function canCurrent(permId: string): boolean {
  return can(getCurrentUserRole(), permId);
}
