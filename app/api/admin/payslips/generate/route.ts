import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { calculatePayslip } from '@/lib/payslip/calculate'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError } from '@/lib/types'

type UserRow       = { id: string; salary_type: string; base_salary: number; commuting_allowance: number; resident_tax: number; work_rule_pattern_id: string | null }
type SalaryConfig  = { user_id: string; salary_type: string; base_salary: number }
type WorkRule      = { work_hours_per_day: number; work_days_per_month: number; overtime_rate_25: number; overtime_rate_50: number; health_insurance_rate: number; pension_rate: number; employment_ins_rate: number }
type PatternRow    = { id: string; work_hours_per_day: number; work_days_per_month: number }
type AttRow        = { user_id: string; actual_minutes: number | null; overtime_minutes: number | null; night_minutes: number; is_holiday_work: boolean; status: string }
type FieldValueRow = { user_id: string; label: string; category: string; amount: number }

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }

    const body = await request.json() as { year: number; month: number; user_ids?: string[] }
    const { year, month, user_ids } = body
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json<ApiError>({ error: '年月が不正です' }, { status: 400 })
    }

    const db = withCompany(payload.company_id)
    const fromDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay  = new Date(year, month, 0).getDate()
    const toDate   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    let targetUserIds: string[] = user_ids ?? []
    if (targetUserIds.length === 0) {
      const { data: users } = await db.select('users', 'id').eq('is_active', true)
      targetUserIds = ((users ?? []) as unknown as { id: string }[]).map((u) => u.id)
    }

    // 必要なデータを並列取得
    const [usersRes, workRuleRes, attendancesRes, fieldValuesRes, salaryConfigsRes, patternsRes] = await Promise.all([
      db.select('users', 'id, salary_type, base_salary, commuting_allowance, resident_tax, work_rule_pattern_id')
        .in('id', targetUserIds),
      db.select('work_rules', 'work_hours_per_day, work_days_per_month, overtime_rate_25, overtime_rate_50, health_insurance_rate, pension_rate, employment_ins_rate')
        .limit(1)
        .single(),
      db.select('attendance_records', 'user_id, actual_minutes, overtime_minutes, night_minutes, is_holiday_work, status')
        .in('user_id', targetUserIds)
        .gte('work_date', fromDate)
        .lte('work_date', toDate),
      // 月別給与項目（当月分のみ）
      supabaseAdmin
        .from('monthly_salary_values')
        .select('user_id, label, category, amount')
        .eq('company_id', payload.company_id)
        .eq('year', year)
        .eq('month', month)
        .in('user_id', targetUserIds),
      // 月別基本給設定（当月分。なければ users テーブルにフォールバック）
      supabaseAdmin
        .from('monthly_salary_config')
        .select('user_id, salary_type, base_salary')
        .eq('company_id', payload.company_id)
        .eq('year', year)
        .eq('month', month)
        .in('user_id', targetUserIds),
      db.select('work_rule_patterns', 'id, work_hours_per_day, work_days_per_month'),
    ])

    const userMap    = new Map(((usersRes.data ?? []) as unknown as UserRow[]).map((u) => [u.id, u]))
    const workRule   = (workRuleRes.data as unknown as WorkRule | null) ?? { work_hours_per_day: 8, work_days_per_month: 20, overtime_rate_25: 1.25, overtime_rate_50: 1.50, health_insurance_rate: 0.0497, pension_rate: 0.0915, employment_ins_rate: 0.006 }
    const patternMap = new Map(((patternsRes.data ?? []) as unknown as PatternRow[]).map((p) => [p.id, p]))
    const attRows    = (attendancesRes.data ?? []) as unknown as AttRow[]
    const fieldValues = (fieldValuesRes.data ?? []) as unknown as FieldValueRow[]
    const salaryConfigMap = new Map(((salaryConfigsRes.data ?? []) as unknown as SalaryConfig[]).map((c) => [c.user_id, c]))

    // 勤怠をユーザーごとに整理
    const attByUser = new Map<string, AttRow[]>()
    for (const r of attRows) {
      if (!attByUser.has(r.user_id)) attByUser.set(r.user_id, [])
      attByUser.get(r.user_id)!.push(r)
    }

    // 社員給与項目をユーザーごとに整理
    const fieldValuesByUser = new Map<string, FieldValueRow[]>()
    for (const v of fieldValues) {
      if (!fieldValuesByUser.has(v.user_id)) fieldValuesByUser.set(v.user_id, [])
      fieldValuesByUser.get(v.user_id)!.push(v)
    }

    const upserts: Record<string, unknown>[]                         = []
    const itemsByUser = new Map<string, Array<Record<string, unknown>>>()

    for (const uid of targetUserIds) {
      const user = userMap.get(uid)
      if (!user) continue

      // 勤怠集計
      const rows           = attByUser.get(uid) ?? []
      const actualWorkDays  = rows.filter((r) => r.status === 'present').length
      const absentDays      = rows.filter((r) => r.status === 'absent').length
      const paidLeaveDays   = rows.filter((r) => r.status === 'leave_paid' || r.status === 'leave_special').length
      const holidayWorkDays = rows.filter((r) => r.is_holiday_work).length
      const totalActualMinutes   = rows.reduce((s, r) => s + (r.actual_minutes   ?? 0), 0)
      const totalOvertimeMinutes = rows.reduce((s, r) => s + (r.overtime_minutes ?? 0), 0)
      const totalNightMinutes    = rows.reduce((s, r) => s + r.night_minutes, 0)

      // 月別給与項目（当月分のみ）
      const userFieldValues = fieldValuesByUser.get(uid) ?? []
      const extraAllowance  = userFieldValues
        .filter((v) => v.category === 'allowance')
        .reduce((s, v) => s + Number(v.amount), 0)
      const extraDeduction  = userFieldValues
        .filter((v) => v.category === 'deduction')
        .reduce((s, v) => s + Number(v.amount), 0)

      // 給与計算（月別設定を優先、なければ users テーブル）
      // 勤務パターンが割り当て済みの場合はパターンの所定時間・日数を使用
      const salaryConfig  = salaryConfigMap.get(uid)
      const userPattern   = user.work_rule_pattern_id ? patternMap.get(user.work_rule_pattern_id) : null
      const result = calculatePayslip({
        salary_type:         ((salaryConfig?.salary_type ?? user.salary_type) as 'monthly' | 'hourly'),
        base_salary:          salaryConfig?.base_salary ?? user.base_salary ?? 0,
        work_hours_per_day:   userPattern?.work_hours_per_day  ?? workRule.work_hours_per_day,
        work_days_per_month:  userPattern?.work_days_per_month ?? workRule.work_days_per_month,
        actual_minutes:       totalActualMinutes,
        overtime_minutes:     totalOvertimeMinutes,
        night_minutes:        totalNightMinutes,
        holiday_work_days:    holidayWorkDays,
        work_days:            actualWorkDays,
        absent_days:          absentDays,
        paid_leave_days:      paidLeaveDays,
        commuting_allowance:  user.commuting_allowance ?? 0,
        other_allowance:      extraAllowance,
        resident_tax:         user.resident_tax ?? 0,
        other_deduction:      extraDeduction,
        overtime_rate_25:        Number(workRule.overtime_rate_25        ?? 1.25),
        overtime_rate_50:        Number(workRule.overtime_rate_50        ?? 1.50),
        health_insurance_rate:   Number(workRule.health_insurance_rate   ?? 0.0497),
        pension_rate:            Number(workRule.pension_rate            ?? 0.0915),
        employment_ins_rate:     Number(workRule.employment_ins_rate     ?? 0.006),
      })

      // overtime_pay_tier2 は payslips テーブルに列がないため除外してスプレッド
      const { overtime_pay_tier2, ...dbResult } = result
      upserts.push({
        company_id:   payload.company_id,
        user_id:      uid,
        year,
        month,
        status:       'draft',
        ...dbResult,
        updated_at:   new Date().toISOString(),
      })

      // 明細行を構築（固定項目 + カスタム項目）
      // 残業手当: 60h超かどうかで分割。overtime_hours > 60 で判定し、
      // tier2 の金額が 0 に切り捨てられても別行表示を維持する（労基法 §37 開示義務）
      const overtimeItems: Array<Record<string, unknown>> =
        result.overtime_hours > 60
          ? [
              { category: 'income', label: '残業手当（〜60h）', amount: Math.round(result.overtime_pay - overtime_pay_tier2), is_auto_calc: true },
              { category: 'income', label: '残業手当（60h超）', amount: Math.round(overtime_pay_tier2),                      is_auto_calc: true },
            ]
          : [{ category: 'income', label: '残業手当', amount: Math.round(result.overtime_pay), is_auto_calc: true }]

      const afterOT = 2 + overtimeItems.length  // 深夜手当の sort_order 基点

      const items: Array<Record<string, unknown>> = [
        { category: 'income',    label: '基本給',   amount: Math.round(result.base_salary),             sort_order: 1,          is_auto_calc: true },
        ...overtimeItems.map((item, i) => ({ ...item, sort_order: 2 + i })),
        { category: 'income',    label: '深夜手当', amount: Math.round(result.night_pay),               sort_order: afterOT,     is_auto_calc: true },
        { category: 'income',    label: '休日手当', amount: Math.round(result.holiday_pay),             sort_order: afterOT + 1, is_auto_calc: true },
        { category: 'income',    label: '通勤手当', amount: Math.round(user.commuting_allowance ?? 0),  sort_order: afterOT + 2, is_auto_calc: false },
        ...userFieldValues
          .filter((v) => v.category === 'allowance' && Number(v.amount) !== 0)
          .map((v, i) => ({
            category:     'income',
            label:         v.label,
            amount:        Math.round(Number(v.amount)),
            sort_order:    afterOT + 3 + i,
            is_auto_calc:  false,
          })),
        { category: 'deduction', label: '健康保険', amount: Math.round(result.health_insurance),     sort_order: 10, is_auto_calc: true },
        { category: 'deduction', label: '厚生年金', amount: Math.round(result.pension),              sort_order: 11, is_auto_calc: true },
        { category: 'deduction', label: '雇用保険', amount: Math.round(result.employment_insurance), sort_order: 12, is_auto_calc: true },
        { category: 'deduction', label: '所得税',   amount: Math.round(result.income_tax),           sort_order: 13, is_auto_calc: true },
        { category: 'deduction', label: '住民税',   amount: Math.round(result.resident_tax),         sort_order: 14, is_auto_calc: false },
        // カスタム控除（社員給与項目DB より）
        ...userFieldValues
          .filter((v) => v.category === 'deduction' && Number(v.amount) !== 0)
          .map((v, i) => ({
            category:     'deduction',
            label:         v.label,
            amount:        Math.round(Number(v.amount)),
            sort_order:    15 + i,
            is_auto_calc:  false,
          })),
      ]

      itemsByUser.set(uid, items)
    }

    const { data: inserted, error } = await db.raw
      .from('payslips')
      .upsert(upserts, { onConflict: 'company_id,user_id,year,month' })
      .select('id, user_id')

    if (error) {
      console.error('payslips upsert error:', error)
      return NextResponse.json<ApiError>({ error: '給与明細の生成に失敗しました', code: error.code }, { status: 500 })
    }

    type InsertedRow = { id: string; user_id: string }
    const insertedRows = (inserted ?? []) as unknown as InsertedRow[]

    for (const row of insertedRows) {
      const items = itemsByUser.get(row.user_id)
      if (!items) continue

      // 全明細行を削除して再作成（生成のたびに DB から最新値を反映）
      await db.raw.from('payslip_items')
        .delete()
        .eq('company_id', payload.company_id)
        .eq('payslip_id', row.id)

      const itemRows = items.map((item) => ({
        ...item,
        company_id: payload.company_id,
        payslip_id: row.id,
        is_active:  true,
      }))
      await db.raw.from('payslip_items').insert(itemRows)
    }

    await writeAuditLog({
      company_id:  payload.company_id,
      user_id:     payload.user_id,
      action:      'payslip_generate',
      table_name:  'payslips',
      new_values:  { year, month, count: upserts.length },
      ip_address:  request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ success: true, generated: upserts.length })
  } catch (err) {
    console.error('payslip generate error:', err)
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
