-- Phase 2b DDL
-- Supabase SQL Editor で実行してください

-- 1. monthly_closings
CREATE TABLE IF NOT EXISTS monthly_closings (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id            uuid NOT NULL REFERENCES companies(id),
  user_id               uuid NOT NULL REFERENCES users(id),
  year                  integer NOT NULL,
  month                 integer NOT NULL,
  employee_confirmed_at timestamptz,
  closed_at             timestamptz,
  closed_by             uuid REFERENCES users(id),
  created_at            timestamptz DEFAULT now(),
  UNIQUE (company_id, user_id, year, month)
);
CREATE INDEX IF NOT EXISTS idx_monthly_closings_company ON monthly_closings(company_id, year, month);

-- 2. requests
CREATE TABLE IF NOT EXISTS requests (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id       uuid NOT NULL REFERENCES companies(id),
  user_id          uuid NOT NULL REFERENCES users(id),
  type             text NOT NULL CHECK (type IN ('leave_paid','leave_special','overtime','attendance_fix')),
  target_date      date,
  reason           text NOT NULL,
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  approver_id      uuid REFERENCES users(id),
  approved_at      timestamptz,
  rejection_reason text,
  note             text,
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_pending ON requests(company_id, status) WHERE status = 'pending';

-- 3. leave_balances
CREATE TABLE IF NOT EXISTS leave_balances (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  uuid NOT NULL REFERENCES companies(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  fiscal_year integer NOT NULL,
  total_days  numeric(5,1) NOT NULL DEFAULT 0,
  used_days   numeric(5,1) NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (company_id, user_id, fiscal_year)
);

-- 4. monthly_closing_batch: トランザクションで締め処理を実行する関数
CREATE OR REPLACE FUNCTION monthly_closing_batch(
  p_company_id uuid,
  p_year       integer,
  p_month      integer,
  p_user_ids   uuid[],
  p_closed_by  uuid
) RETURNS jsonb AS $$
DECLARE
  v_from_date date;
  v_to_date   date;
  v_uid       uuid;
  v_count     integer := 0;
BEGIN
  v_from_date := make_date(p_year, p_month, 1);
  v_to_date   := (v_from_date + interval '1 month - 1 day')::date;

  FOREACH v_uid IN ARRAY p_user_ids LOOP
    -- monthly_closings に upsert（already closed は無視）
    INSERT INTO monthly_closings (company_id, user_id, year, month, closed_at, closed_by)
    VALUES (p_company_id, v_uid, p_year, p_month, now(), p_closed_by)
    ON CONFLICT (company_id, user_id, year, month) DO NOTHING;

    -- 対象月の勤怠レコードをロック
    UPDATE attendance_records
    SET is_locked = true
    WHERE company_id = p_company_id
      AND user_id   = v_uid
      AND work_date BETWEEN v_from_date AND v_to_date;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('processed', v_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. monthly_closing_unlock: ロック解除トランザクション
CREATE OR REPLACE FUNCTION monthly_closing_unlock(
  p_company_id   uuid,
  p_closing_id   uuid
) RETURNS jsonb AS $$
DECLARE
  v_year  integer;
  v_month integer;
  v_uid   uuid;
BEGIN
  SELECT year, month, user_id INTO v_year, v_month, v_uid
  FROM monthly_closings
  WHERE id = p_closing_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'closing_not_found';
  END IF;

  DELETE FROM monthly_closings WHERE id = p_closing_id;

  UPDATE attendance_records
  SET is_locked = false
  WHERE company_id = p_company_id
    AND user_id   = v_uid
    AND work_date BETWEEN make_date(v_year, v_month, 1)
                      AND (make_date(v_year, v_month, 1) + interval '1 month - 1 day')::date;

  RETURN jsonb_build_object('unlocked', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
