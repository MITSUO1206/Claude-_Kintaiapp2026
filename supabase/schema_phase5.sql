-- schema_phase5.sql
-- 社員データベース: 手当・控除フィールド定義と値

-- 共通列マスタ（会社ごとに定義する手当・控除の列）
CREATE TABLE IF NOT EXISTS employee_field_defs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id),
  label       text NOT NULL,
  category    text NOT NULL CHECK (category IN ('allowance', 'deduction')),
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- 社員ごとのフィールド値（共通列 + 個別列）
CREATE TABLE IF NOT EXISTS employee_field_values (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  field_id   uuid REFERENCES employee_field_defs(id) ON DELETE SET NULL,
  label      text NOT NULL,
  category   text NOT NULL CHECK (category IN ('allowance', 'deduction')),
  amount     numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 共通列（field_id IS NOT NULL）のみ1人1値を保証
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_field_values_shared
  ON employee_field_values (company_id, user_id, field_id)
  WHERE field_id IS NOT NULL;

-- RLS無効（supabaseAdminで操作するため）
ALTER TABLE employee_field_defs DISABLE ROW LEVEL SECURITY;
ALTER TABLE employee_field_values DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
