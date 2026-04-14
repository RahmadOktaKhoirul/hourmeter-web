-- ============================================================
-- Migration: RPC untuk membuat dan mengupdate password user
-- Jalankan di Supabase Dashboard > SQL Editor
-- ============================================================

-- Function: Buat user baru dengan password ter-hash (bcrypt)
create or replace function public.create_app_user(
  p_name text,
  p_email text,
  p_role text,
  p_status text,
  p_business_unit_id uuid,
  p_password text
) returns void
language plpgsql security definer as $$
begin
  insert into public.app_users (name, email, role, status, business_unit_id, password_hash)
  values (
    p_name,
    p_email,
    p_role,
    p_status,
    p_business_unit_id,
    crypt(p_password, gen_salt('bf'))
  );
end;
$$;

-- Function: Update password user (hash ulang dengan bcrypt)
create or replace function public.update_user_password(
  p_user_id uuid,
  p_new_password text
) returns void
language plpgsql security definer as $$
begin
  update public.app_users
  set password_hash = crypt(p_new_password, gen_salt('bf'))
  where id = p_user_id;
end;
$$;

-- ============================================================
-- Update verify_user_password agar mendukung password lama
-- yang tersimpan sebagai plain text (backward compatibility).
-- Jika hash sudah bcrypt (mulai dari '$2'), pakai bcrypt verify.
-- Jika tidak (plain text), coba bandingkan langsung, lalu
-- otomatis upgrade ke bcrypt agar login berikutnya aman.
-- ============================================================
create or replace function public.verify_user_password(p_email text, p_password text)
returns table(id uuid, name text, email text, role text, status text, avatar_url text, business_unit_id uuid)
language plpgsql security definer as $$
declare
  v_user public.app_users%rowtype;
begin
  -- Ambil user berdasarkan email
  select * into v_user
  from public.app_users u
  where u.email = p_email;

  -- Jika user tidak ditemukan, return kosong
  if not found then
    return;
  end if;

  -- Cek apakah hash bcrypt (format: $2a$ atau $2b$)
  if v_user.password_hash like '$2%' then
    -- Verifikasi bcrypt
    if v_user.password_hash = crypt(p_password, v_user.password_hash) then
      return query select v_user.id, v_user.name, v_user.email,
        v_user.role, v_user.status, v_user.avatar_url, v_user.business_unit_id;
    end if;
  else
    -- Password plain text lama — bandingkan langsung
    if v_user.password_hash = p_password then
      -- Otomatis upgrade ke bcrypt untuk login berikutnya
      update public.app_users
      set password_hash = crypt(p_password, gen_salt('bf'))
      where id = v_user.id;

      return query select v_user.id, v_user.name, v_user.email,
        v_user.role, v_user.status, v_user.avatar_url, v_user.business_unit_id;
    end if;
  end if;

  -- Password salah — return kosong
  return;
end;
$$;
