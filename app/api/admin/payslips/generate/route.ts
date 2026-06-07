import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { calculatePayslip } from '@/lib/payslip/calculate'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError } from '@/lib/types'

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

    const { data: usersData } = await db
      .select('users', 'id, salary_type, base_salary, commuting_allowance, resident_tax')
      .in('id', targetUserIds)

    const { data: workRuleData } = await db
      .select('work_rules', 'work_hours_per_day, work_days_per_month')
      .limit(1)
      .single()

    type UserRow = { id: string; salary_type: string; base_salary: number; commuting_allowance: number; resident_tax: number }
    type WorkRule = { work_hours_per_day: number; work_days_per_month: number }

    const userMap = new Map(((usersData ?? []) as unknown as UserRow[]).map((u) => [u.id, u]))
    const workRule = (workRuleData as unknown as WorkRule | null) ?? { work_hours_per_day: 8, work_days_per_month: 20 }

    const { data: attendances } = await db
      .select('attendance_records', 'user_id, actual_minutes, overtime_minutes, night_minutes, is_holiday_work, status')
      .in('user_id', targetUserIds)
      .gte('work_date', fromDate)
      .lte('work_date', toDate)

    type AttRow = { user_id: string; actual_minutes: number | null; overtime_minutes: number | null; night_minutes: number; is_holiday_work: boolean; status: string }
    const attRows = (attendances ?? []) as unknown as AttRow[]

    const attByUser = new Map<string, AttRow[]>()
    for (const r of attRows) {
      if (!attByUser.has(r.user_id)) attByUser.set(r.user_id, [])
      attByUser.get(r.user_id)!.push(r)
    }

    const upserts: Record<string, unknown>[] = []
    const itemsByUser = new Map<string, Array<Record<string, unknown>>>()

    for (const uid of targetUserIds) {
      const user = userMap.get(uid)
      if (!user) continue

      const rows = attByUser.get(uid) ?? []
      const actualWorkDays  = rows.filter((r) => r.status === 'present').length
      const absentDays      = rows.filter((r) => r.status === 'absent').length
      const paidLeaveDays   = rows.filter((r) => r.status === 'leave_paid' || r.status === 'leave_special').length
      const holidayWorkDays = rows.filter((r) => r.is_holiday_work).length

      const totalActualMinutes   = rows.reduce((s, r) => s + (r.actual_minutes ?? 0), 0)
      const totalOvertimeMinutes = rows.reduce((s, r) => s + (r.overtime_minutes ?? 0), 0)
      const totalNightMinutes    = rows.reduce((s, r) => s + r.night_minutes, 0)

      const result = calculatePayslip({
        salary_type: (user.salary_type as 'monthly' | 'hourly') ?? 'monthly',
        base_salary: user.base_salary ?? 0,
        work_hours_per_day: workRule.work_hours_per_day,
        work_days_per_month: workRule.work_days_per_month,
        actual_minutes: totalActualMinutes,
        overtime_minutes: totalOvertimeMinutes,
        night_minutes: totalNightMinutes,
        holiday_work_days: holidayWorkDays,
        work_days: actualWorkDays,
        absent_days: absentDays,
        paid_leave_days: paidLeaveDays,
        commuting_allowance: user.commuting_allowance ?? 0,
        other_allowance: 0,
        resident_tax: user.resident_tax ?? 0,
        other_deduction: 0,
      })

      upserts.push({
        company_id: payload.company_id,
        user_id: uid,
        year,
        month,
        status: 'draft',
        ...result,
        updated_at: new Date().toISOString(),
      })

      // payslip_items 用データ（後でpayslip_idと紐付け）
      const items: Array<Record<string, unknown>> = [
        { category: 'income',    label: '基本給',     amount: Math.round(result.base_salary), sort_order: 1, is_auto_calc: true },
        { category: 'income',    label: '残業手当',   amount: Math.round(result.overtime_pay), sort_order: 2, is_auto_calc: true },
        { category: 'income',    label: '深夜手当',   amount: Math.round(result.night_pay), sort_order: 3, is_auto_calc: true },
        { category: 'income',    label: '休日手当',   amount: Math.round(result.holiday_pay), sort_order: 4, is_auto_calc: true },
        { category: 'income',    label: '通勤手当',   amount: Math.round(result.commuting_allowance), sort_order: 5, is_auto_calc: false },
        { category: 'deduction', label: '健康保険',   amount: Math.round(result.health_insurance), sort_order: 10, is_auto_calc: true },
        { category: 'deduction', label: '厚生年金',   amount: Math.round(result.pension), sort_order: 11, is_auto_calc: true },
        { category: 'deduction', label: '雇用保険',   amount: Math.round(result.employment_insurance), sort_order: 12, is_auto_calc: true },
        { category: 'deduction', label: '所得税',     amount: Math.round(result.income_tax), sort_order: 13, is_auto_calc: true },
        { category: 'deduction', label: '住民税',     amount: Math.round(result.resident_tax), sort_order: 14, is_auto_calc: false },
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

    // payslip_items を upsert
    type InsertedRow = { id: string; user_id: string }
    const insertedRows = (inserted ?? []) as unknown as InsertedRow[]

    for (const row of insertedRows) {
      const items = itemsByUser.get(row.user_id)
      if (!items) continue

      // 既存の自動計算 items を削除して再作成
      await db.raw.from('payslip_items')
        .delete()
        .eq('company_id', payload.company_id)
        .eq('payslip_id', row.id)
        .eq('is_auto_calc', true)

      const itemRows = items.map((item) => ({
        ...item,
        company_id: payload.company_id,
        payslip_id: row.id,
        is_active: true,
      }))
      await db.raw.from('payslip_items').insert(itemRows)
    }

    await writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'payslip_generate',
      table_name: 'payslips',
      new_values: { year, month, count: upserts.length },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ success: true, generated: upserts.length })
  } catch (err) {
    console.error('payslip generate error:', err)
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
