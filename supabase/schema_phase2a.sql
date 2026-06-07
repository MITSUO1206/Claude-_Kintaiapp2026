-- ===== KintaiApp Phase 2a 追加テーブル =====

CREATE TABLE IF NOT EXISTS break_logs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    uuid NOT NULL REFERENCES companies(id),
  attendance_id uuid NOT NULL REFERENCES attendance_records(id),
  break_start   timestamptz NOT NULL,
  break_end     timestamptz,
  created_at    timestamptz DEFAULT now()
);

-- break_end=NULL の行は同一 attendance_id に対して 1 行のみ（2端末同時 break_start 防止）
CREATE UNIQUE INDEX IF NOT EXISTS uq_break_logs_active
  ON break_logs (attendance_id)
  WHERE (break_end IS NULL);

-- パフォーマンス用インデックス
CREATE INDEX IF NOT EXISTS idx_break_logs_attendance
  ON break_logs (attendance_id);
