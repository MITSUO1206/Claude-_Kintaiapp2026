-- Phase 4: 会社設定拡張（法定休日・支給日設定）
ALTER TABLE work_rules ADD COLUMN IF NOT EXISTS holiday_weekdays TEXT[] NOT NULL DEFAULT ARRAY['sunday'];
ALTER TABLE work_rules ADD COLUMN IF NOT EXISTS payment_on_holiday TEXT NOT NULL DEFAULT '前倒し';

NOTIFY pgrst, 'reload schema';
