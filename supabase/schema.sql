-- ===== KintaiApp Phase 1 テーブル定義 =====

-- companies
CREATE TABLE IF NOT EXISTS companies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_code text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- work_rules（就業規則）
CREATE TABLE IF NOT EXISTS work_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  work_hours_per_day numeric NOT NULL DEFAULT 8,
  work_days_per_month integer NOT NULL DEFAULT 20,
  start_time time NOT NULL DEFAULT '09:00',
  end_time time NOT NULL DEFAULT '18:00',
  break_minutes integer NOT NULL DEFAULT 60,
  overtime_alert_hours integer NOT NULL DEFAULT 36,
  overtime_limit_hours integer NOT NULL DEFAULT 45,
  created_at timestamptz DEFAULT now()
);

-- users（社員マスタ・認証）
CREATE TABLE IF NOT EXISTS users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  employee_code text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('employee', 'manager', 'admin')),
  salary_type text NOT NULL DEFAULT 'monthly' CHECK (salary_type IN ('monthly', 'hourly')),
  base_salary numeric,
  password_hash text NOT NULL,
  force_password_change boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  hired_at date NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, employee_code)
);

-- attendance_records（打刻記録）
CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  user_id uuid NOT NULL REFERENCES users(id),
  work_date date NOT NULL,
  clock_in timestamptz,
  clock_out timestamptz,
  break_minutes integer NOT NULL DEFAULT 0,
  actual_minutes integer,
  overtime_minutes integer,
  night_minutes integer NOT NULL DEFAULT 0,
  holiday_minutes integer NOT NULL DEFAULT 0,
  is_holiday_work boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'present'
    CHECK (status IN ('present', 'absent', 'late', 'leave_paid', 'leave_special')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (company_id, user_id, work_date)
);

-- audit_logs（監査ログ・DELETE禁止・要件定義書 §3参照）
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  table_name text,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- ===== テスト用シードデータ =====

INSERT INTO companies (id, company_code, name)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'ACME-001',
  'ACME株式会社'
) ON CONFLICT DO NOTHING;

INSERT INTO work_rules (company_id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- テストユーザー追加（bcryptハッシュは下記コマンドで生成）:
-- node -e "const b=require('bcryptjs');b.hash('Admin1234!',12).then(h=>console.log(h))"
--
-- INSERT INTO users (company_id, employee_code, name, email, role, salary_type, base_salary, password_hash, force_password_change, is_active, hired_at)
-- VALUES
-- ('00000000-0000-0000-0000-000000000001','ADMIN-001','管理者太郎','admin@acme.co.jp','admin','monthly',500000,'<ハッシュ>',false,true,'2020-04-01'),
-- ('00000000-0000-0000-0000-000000000001','EMP-0001','田中誠','tanaka@acme.co.jp','employee','monthly',300000,'<ハッシュ>',false,true,'2022-04-01');
