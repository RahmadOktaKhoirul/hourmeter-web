-- =================================================================
-- Migration: Tambah kolom unit_type ke tabel machines
-- Jalankan di Supabase Dashboard > SQL Editor
-- Aman dijalankan berkali-kali (IF NOT EXISTS / idempotent)
-- =================================================================

-- 1. Tambah kolom unit_type dengan nilai BSC atau BDF
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS unit_type TEXT
    CHECK (unit_type IN ('BSC', 'BDF'));

COMMENT ON COLUMN public.machines.unit_type IS
  'Tipe unit alat berat: BSC atau BDF (lainnya)';

-- 2. Index untuk filter cepat berdasarkan tipe
CREATE INDEX IF NOT EXISTS idx_machines_unit_type
  ON public.machines (unit_type);
