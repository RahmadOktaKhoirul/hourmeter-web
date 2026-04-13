/**
 * HM Digital — MQTT Bridge
 * Subscribe ke MQTT broker ESP32, push data ke Supabase.
 *
 * Jalankan dari root project: npm run bridge
 */

import mqtt from 'mqtt';
import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';

// ── Validasi env ─────────────────────────────────────────────
const { url: supabaseUrl, anonKey } = config.supabase;
if (!supabaseUrl || !anonKey) {
  console.error('[bridge] ERROR: VITE_SUPABASE_URL atau VITE_SUPABASE_ANON_KEY tidak ditemukan di .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, anonKey);

// ── Build topic map ───────────────────────────────────────────
const topicMap = {};
const subscribeTopics = [];

for (const m of config.machines) {
  const dataTopic = `${m.topicPrefix}/hm/data`;
  const logTopic  = `${m.topicPrefix}/hm/log`;
  topicMap[dataTopic] = { machineCode: m.machineCode, type: 'data' };
  topicMap[logTopic]  = { machineCode: m.machineCode, type: 'log' };
  subscribeTopics.push(dataTopic, logTopic);
}

// ── Connect MQTT ──────────────────────────────────────────────
const mqttUrl = `mqtt://${config.mqtt.host}:${config.mqtt.port}`;
console.log(`[bridge] Connecting to MQTT broker: ${mqttUrl}`);

const client = mqtt.connect(mqttUrl, {
  clientId: config.mqtt.clientId,
  reconnectPeriod: config.mqtt.reconnectPeriod,
  connectTimeout: 10000,
});

client.on('connect', () => {
  console.log('[bridge] Connected to MQTT broker');
  client.subscribe(subscribeTopics, { qos: 0 }, (err) => {
    if (err) {
      console.error('[bridge] Subscribe error:', err.message);
    } else {
      console.log(`[bridge] Subscribed to ${subscribeTopics.length} topics:`);
      subscribeTopics.forEach(t => console.log(`         • ${t}`));
    }
  });
});

client.on('reconnect', () => console.log('[bridge] Reconnecting...'));
client.on('error', (err) => console.error('[bridge] MQTT error:', err.message));
client.on('offline', () => console.warn('[bridge] MQTT offline'));

// ── Message handler ───────────────────────────────────────────
client.on('message', async (topic, payload) => {
  const entry = topicMap[topic];
  if (!entry) return;

  let json;
  try {
    json = JSON.parse(payload.toString());
  } catch {
    console.warn(`[bridge] Invalid JSON on ${topic}`);
    return;
  }

  if (entry.type === 'data') {
    await handleData(entry.machineCode, json);
  } else {
    await handleLog(entry.machineCode, json);
  }
});

// ── Handle data topic ─────────────────────────────────────────
async function handleData(machineCode, json) {
  const hmSec     = Number(json.hm_sec      ?? 0);
  const prevHmSec = Number(json.prev_hm_sec ?? 0);
  const running   = json.status === 'RUNNING';
  const clientId  = json.client_id ?? null;

  const { error } = await supabase.rpc('upsert_machine_mqtt', {
    p_machine_code:   machineCode,
    p_hm_sec:         hmSec,
    p_prev_hm_sec:    prevHmSec,
    p_engine_running: running,
    p_client_id:      clientId,
  });

  if (error) {
    console.error(`[bridge] upsert error (${machineCode}):`, error.message);
  } else {
    console.log(`[bridge] ${machineCode} | ${running ? 'RUNNING' : 'STOPPED'} | HM: ${(hmSec / 3600).toFixed(2)}h`);
  }
}

// ── Handle log topic ──────────────────────────────────────────
async function handleLog(machineCode, json) {
  const event       = String(json.event         ?? '');
  const prevHmHours = Number(json.prev_hm_hours ?? 0);
  const timestamp   = String(json.timestamp     ?? '');

  if (!event) return;

  const { error } = await supabase.rpc('insert_mqtt_log', {
    p_machine_code:  machineCode,
    p_event:         event,
    p_prev_hm_hours: prevHmHours,
    p_timestamp:     timestamp || null,
  });

  if (error) {
    console.error(`[bridge] log error (${machineCode}):`, error.message);
  } else {
    console.log(`[bridge] LOG ${machineCode} | ${event}`);
  }
}

// ── Graceful shutdown ─────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n[bridge] Shutting down...');
  client.end();
  process.exit(0);
});
