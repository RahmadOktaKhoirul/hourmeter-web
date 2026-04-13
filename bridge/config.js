/**
 * Konfigurasi MQTT Bridge
 * Sesuaikan dengan setup ESP32 dan Supabase kamu
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Load .env.local dari root project
try {
  const lines = readFileSync(join(process.cwd(), '.env.local'), 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^#=\s][^=]*)=(.*)/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '');
  }
} catch {}

export const config = {
  // ── MQTT Broker (ESP32 / lokal) ──────────────────────────
  mqtt: {
    host: process.env.MQTT_HOST || '192.168.100.107',
    port: parseInt(process.env.MQTT_PORT || '1883'),
    clientId: `hm-bridge-${Date.now()}`,
    reconnectPeriod: 5000,
  },

  // ── Supabase ─────────────────────────────────────────────
  supabase: {
    url: process.env.VITE_SUPABASE_URL,
    anonKey: process.env.VITE_SUPABASE_ANON_KEY,
  },

  // ── Mapping: MQTT topic prefix → machine_code di Supabase ─
  // Format: 'factory/<prefix>/hm/data' → machine_code
  // Sesuaikan dengan machine_code yang ada di tabel machines
  machines: [
    {
      topicPrefix: 'factory/machine1',   // topic: factory/machine1/hm/data & hm/log
      machineCode: 'EXC-204-G',          // machine_code di Supabase
    },
    // Tambah mesin lain di sini:
    // { topicPrefix: 'factory/machine2', machineCode: 'DRL-882-X' },
  ],
};
