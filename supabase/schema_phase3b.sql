-- Phase 3b Schema Additions

CREATE TABLE IF NOT EXISTS payslip_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  payslip_id UUID NOT NULL REFERENCES payslips(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('income', 'deduction', 'adjustment')),
  label TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  note TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_auto_calc BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payslip_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  category TEXT NOT NULL CHECK (category IN ('income', 'deduction', 'adjustment')),
  label TEXT NOT NULL,
  default_amount NUMERIC,
  note TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

ALTER TABLE work_rules ADD COLUMN IF NOT EXISTS closing_day INT NOT NULL DEFAULT 31;
ALTER TABLE work_rules ADD COLUMN IF NOT EXISTS payment_day INT NOT NULL DEFAULT 25;

NOTIFY pgrst, 'reload schema';
