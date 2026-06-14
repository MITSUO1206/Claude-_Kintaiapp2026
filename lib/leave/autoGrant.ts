import { supabaseAdmin } from '@/lib/supabase/admin'
import { getGrantCycles, toDateStr } from './grantCalc'

export type UserForGrant = {
  id: string
  company_id: string
  hired_at: string
  weekly_working_days: number
}

// 出勤率を計算（有給・特休も出勤扱い / レコードなしは 1.0 とみなす）
async function calcAttendanceRate(userId: string, from: Date, to: Date): Promise<number> {
  const { data } = await supabaseAdmin
    .from('attendance_records')
    .select('status')
    .eq('user_id', userId)
    .gte('work_date', toDateStr(from))
    .lte('work_date', toDateStr(to))

  if (!data || data.length === 0) return 1.0

  // 期間内の平日数を予定出勤日として使用
  let scheduled = 0
  const cur = new Date(from)
  while (cur <= to) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) scheduled++
    cur.setDate(cur.getDate() + 1)
  }
  if (scheduled === 0) return 1.0

  const worked = (data as { status: string }[]).filter((r) =>
    ['present', 'leave_paid', 'leave_special'].includes(r.status)
  ).length

  return worked / scheduled
}

// ユーザーに対して未処理の法定付与をすべて実行（遅延評価）
export async function processAutoGrants(user: UserForGrant): Promise<void> {
  if (!user.hired_at) return

  const now    = new Date()
  const cycles = getGrantCycles(user.hired_at, user.weekly_working_days ?? 5)

  const { data: existing } = await supabaseAdmin
    .from('leave_grants')
    .select('grant_date')
    .eq('user_id', user.id)
    .eq('basis', 'statutory')

  const existingDates = new Set(
    ((existing ?? []) as { grant_date: string }[]).map((g) => g.grant_date)
  )

  for (const cycle of cycles) {
    if (cycle.grantDate > now) break // 未来の付与は処理しない

    const dateStr = toDateStr(cycle.grantDate)
    if (existingDates.has(dateStr)) continue // 既に処理済み

    // 出勤率チェック（8割以上）
    const rate = await calcAttendanceRate(user.id, cycle.periodFrom, cycle.periodTo)
    if (rate < 0.8) {
      // 出勤率不足でも記録は残す（basis='statutory_skipped'）
      await supabaseAdmin.from('leave_grants').insert({
        company_id:   user.company_id,
        user_id:      user.id,
        grant_date:   dateStr,
        granted_days: 0,
        basis:        'statutory_skipped',
        note:         `出勤率 ${Math.round(rate * 100)}%（8割未満のため付与なし）`,
      })
      existingDates.add(dateStr)
      continue
    }

    // leave_grants に挿入
    const { error: grantErr } = await supabaseAdmin.from('leave_grants').insert({
      company_id:   user.company_id,
      user_id:      user.id,
      grant_date:   dateStr,
      granted_days: cycle.grantedDays,
      basis:        'statutory',
    })
    if (grantErr) continue

    existingDates.add(dateStr)

    // leave_balances を更新（grant_date の年を fiscal_year として使用）
    const fiscalYear = cycle.grantDate.getFullYear()
    const { data: lb } = await supabaseAdmin
      .from('leave_balances')
      .select('id')
      .eq('user_id', user.id)
      .eq('fiscal_year', fiscalYear)
      .single()

    if (lb) {
      await supabaseAdmin
        .from('leave_balances')
        .update({ total_days: cycle.grantedDays })
        .eq('id', (lb as { id: string }).id)
    } else {
      await supabaseAdmin.from('leave_balances').insert({
        company_id:  user.company_id,
        user_id:     user.id,
        fiscal_year: fiscalYear,
        total_days:  cycle.grantedDays,
        used_days:   0,
      })
    }
  }
}
