-- Phase 3 DDL
-- Supabase SQL Editor で実行してください

-- users に通勤手当・住民税列を追加
ALTER TABLE users ADD COLUMN IF NOT EXISTS commuting_allowance numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS resident_tax numeric(10,2) NOT NULL DEFAULT 0;

-- payslips (給与明細)
CREATE TABLE IF NOT EXISTS payslips (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id            uuid NOT NULL REFERENCES companies(id),
  user_id               uuid NOT NULL REFERENCES users(id),
  year                  integer NOT NULL,
  month                 integer NOT NULL,
  work_days             integer NOT NULL DEFAULT 0,
  absent_days           integer NOT NULL DEFAULT 0,
  paid_leave_days       numeric(5,1) NOT NULL DEFAULT 0,
  actual_hours          numeric(8,2) NOT NULL DEFAULT 0,
  overtime_hours        numeric(8,2) NOT NULL DEFAULT 0,
  night_hours           numeric(8,2) NOT NULL DEFAULT 0,
  holiday_work_days     integer NOT NULL DEFAULT 0,
  base_salary           numeric(12,2) NOT NULL DEFAULT 0,
  overtime_pay          numeric(12,2) NOT NULL DEFAULT 0,
  night_pay             numeric(12,2) NOT NULL DEFAULT 0,
  holiday_pay           numeric(12,2) NOT NULL DEFAULT 0,
  commuting_allowance   numeric(12,2) NOT NULL DEFAULT 0,
  other_allowance       numeric(12,2) NOT NULL DEFAULT 0,
  gross_pay             numeric(12,2) NOT NULL DEFAULT 0,
  health_insurance      numeric(12,2) NOT NULL DEFAULT 0,
  pension               numeric(12,2) NOT NULL DEFAULT 0,
  employment_insurance  numeric(12,2) NOT NULL DEFAULT 0,
  income_tax            numeric(12,2) NOT NULL DEFAULT 0,
  resident_tax          numeric(12,2) NOT NULL DEFAULT 0,
  other_deduction       numeric(12,2) NOT NULL DEFAULT 0,
  total_deduction       numeric(12,2) NOT NULL DEFAULT 0,
  net_pay               numeric(12,2) NOT NULL DEFAULT 0,
  is_finalized          boolean NOT NULL DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE (company_id, user_id, year, month)
);
CREATE INDEX IF NOT EXISTS idx_payslips_user ON payslips(user_id);
CREATE INDEX IF NOT EXISTS idx_payslips_period ON payslips(company_id, year, month);

NOTIFY pgrst, 'reload schema';
