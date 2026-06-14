import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { calculatePayslip } from '@/lib/payslip/calculate'

type UserRow        = { id: string; salary_type: string; base_salary: number; commuting_allowance: number; resident_tax: number }
type WorkRule       = { work_hours_per_day: number; work_days_per_month: number }
type AttRow         = { user_id: string; actual_minutes: number | null; overtime_minutes: number | null; night_minutes: number; is_holiday_work: boolean; status: string }
type FieldValueRow  = { user_id: string; category: string; amount: number }
type SalaryConfig   = { user_id: string; salary_type: string; base_salary: number }

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }

    const url   = new URL(request.url)
    const year  = parseInt(url.searchParams.get('year')  ?? String(new Date().getFullYear()))
    const month = parseInt(url.searchParams.get('month') ?? String(new Date().getMonth() + 1))

    const db        = withCompany(payload.company_id)
    const fromDate  = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay   = new Date(year, month, 0).getDate()
    const toDate    = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const [usersRes, workRuleRes, attendancesRes, fieldValuesRes, salaryConfigsRes] = await Promise.all([
      db.select('users', 'id, salary_type, base_salary, commuting_allowance, resident_tax').eq('is_active', true),
      db.select('work_rules', 'work_hours_per_day, work_days_per_month').limit(1).single(),
      db.select('attendance_records', 'user_id, actual_minutes, overtime_minutes, night_minutes, is_holiday_work, status')
        .gte('work_date', fromDate)
        .lte('work_date', toDate),
      supabaseAdmin
        .from('monthly_salary_values')
        .select('user_id, category, amount')
        .eq('company_id', payload.company_id)
        .eq('year', year)
        .eq('month', month),
      supabaseAdmin
        .from('monthly_salary_config')
        .select('user_id, salary_type, base_salary')
        .eq('company_id', payload.company_id)
        .eq('year', year)
        .eq('month', month),
    ])

    const users       = (usersRes.data        ?? []) as unknown as UserRow[]
    const workRule    = (workRuleRes.data as unknown as WorkRule | null) ?? { work_hours_per_day: 8, work_days_per_month: 20 }
    const attRows     = (attendancesRes.data   ?? []) as unknown as AttRow[]
    const fieldValues = (fieldValuesRes.data   ?? []) as unknown as FieldValueRow[]
    const salaryConfigs = (salaryConfigsRes.data ?? []) as unknown as SalaryConfig[]
    const salaryConfigMap = new Map(salaryConfigs.map((c) => [c.user_id, c]))

    const attByUser = new Map<string, AttRow[]>()
    for (const r of attRows) {
      if (!attByUser.has(r.user_id)) attByUser.set(r.user_id, [])
      attByUser.get(r.user_id)!.push(r)
    }

    const fieldByUser = new Map<string, FieldValueRow[]>()
    for (const v of fieldValues) {
      if (!fieldByUser.has(v.user_id)) fieldByUser.set(v.user_id, [])
      fieldByUser.get(v.user_id)!.push(v)
    }

    const previews = users.map((user) => {
      // monthly_salary_config が存在する月はそちらを優先、なければ users テーブル（未来月フォールバック）
      const config = salaryConfigMap.get(user.id)
      const rows            = attByUser.get(user.id) ?? []
      const work_days       = rows.filter((r) => r.status === 'present').length
      const absent_days     = rows.filter((r) => r.status === 'absent').length
      const paid_leave_days = rows.filter((r) => r.status === 'leave_paid' || r.status === 'leave_special').length
      const holiday_work_days = rows.filter((r) => r.is_holiday_work).length
      const actual_minutes    = rows.reduce((s, r) => s + (r.actual_minutes   ?? 0), 0)
      const overtime_minutes  = rows.reduce((s, r) => s + (r.overtime_minutes ?? 0), 0)
      const night_minutes     = rows.reduce((s, r) => s + r.night_minutes, 0)

      const userFields    = fieldByUser.get(user.id) ?? []
      const other_allowance = userFields.filter((v) => v.category === 'allowance').reduce((s, v) => s + Number(v.amount), 0)
      const other_deduction = userFields.filter((v) => v.category === 'deduction').reduce((s, v) => s + Number(v.amount), 0)

      const result = calculatePayslip({
        salary_type:         ((config?.salary_type ?? user.salary_type) as 'monthly' | 'hourly'),
        base_salary:          config?.base_salary ?? user.base_salary ?? 0,
        work_hours_per_day:   workRule.work_hours_per_day,
        work_days_per_month:  workRule.work_days_per_month,
        actual_minutes,
        overtime_minutes,
        night_minutes,
        holiday_work_days,
        work_days,
        absent_days,
        paid_leave_days,
        commuting_allowance:  user.commuting_allowance ?? 0,
        other_allowance,
        resident_tax:         user.resident_tax        ?? 0,
        other_deduction,
      })

      return {
        user_id:        user.id,
        gross_pay:      result.gross_pay,
        total_deduction: result.total_deduction,
        net_pay:        result.net_pay,
      }
    })

    return NextResponse.json({ previews })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
