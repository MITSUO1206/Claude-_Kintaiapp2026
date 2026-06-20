import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { sendOvertimeAlert } from '@/lib/email/resend'

type UserRow = { id: string; name: string; employee_code: string; email: string | null }
type AttRow  = { user_id: string; overtime_minutes: number | null; work_date: string }
type WorkRuleRow = { overtime_limit_hours: number; overtime_annual_limit: number; overtime_alert_hours: number }

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }

    const url   = new URL(request.url)
    const now   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    const year  = parseInt(url.searchParams.get('year')  ?? String(now.getFullYear()))
    const month = parseInt(url.searchParams.get('month') ?? String(now.getMonth() + 1))

    const db = withCompany(payload.company_id)

    const yearFrom  = `${year}-01-01`
    const yearTo    = `${year}-12-31`
    const monthFrom = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay   = new Date(year, month, 0).getDate()
    const monthTo   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const [usersRes, attYearRes, workRuleRes] = await Promise.all([
      db.select('users', 'id, name, employee_code, email').eq('is_active', true).order('employee_code'),
      db.select('attendance_records', 'user_id, overtime_minutes, work_date')
        .gte('work_date', yearFrom)
        .lte('work_date', yearTo),
      db.select('work_rules', 'overtime_limit_hours, overtime_annual_limit, overtime_alert_hours').limit(1).single(),
    ])

    const users    = (usersRes.data    ?? []) as unknown as UserRow[]
    const attRows  = (attYearRes.data  ?? []) as unknown as AttRow[]
    const rule     = (workRuleRes.data as unknown as WorkRuleRow | null) ?? {
      overtime_limit_hours:  45,
      overtime_annual_limit: 360,
      overtime_alert_hours:  36,
    }

    const monthlyLimit = Number(rule.overtime_limit_hours  ?? 45)
    const annualLimit  = Number(rule.overtime_annual_limit ?? 360)
    const alertHours   = Number(rule.overtime_alert_hours  ?? monthlyLimit - 9)

    // ユーザーごとに当月・年間残業を集計
    const monthlyMap = new Map<string, number>()
    const annualMap  = new Map<string, number>()

    for (const r of attRows) {
      const mins = r.overtime_minutes ?? 0
      // 年間累計
      annualMap.set(r.user_id, (annualMap.get(r.user_id) ?? 0) + mins)
      // 当月のみ
      if (r.work_date >= monthFrom && r.work_date <= monthTo) {
        monthlyMap.set(r.user_id, (monthlyMap.get(r.user_id) ?? 0) + mins)
      }
    }

    function toHours(mins: number) { return Math.round(mins / 6) / 10 }

    function getStatus(hours: number, limit: number, alert: number): 'ok' | 'warning' | 'danger' {
      if (hours >= limit)  return 'danger'
      if (hours >= alert)  return 'warning'
      return 'ok'
    }

    const alerts = users.map((u) => {
      const monthlyHours = toHours(monthlyMap.get(u.id) ?? 0)
      const annualHours  = toHours(annualMap.get(u.id)  ?? 0)
      const monthlyStatus = getStatus(monthlyHours, monthlyLimit, alertHours)
      const annualStatus  = getStatus(annualHours,  annualLimit,  annualLimit * 0.8)
      const worstStatus   = monthlyStatus === 'danger' || annualStatus === 'danger' ? 'danger'
                          : monthlyStatus === 'warning' || annualStatus === 'warning' ? 'warning'
                          : 'ok'
      return {
        user_id:        u.id,
        name:           u.name,
        employee_code:  u.employee_code,
        monthly_hours:  monthlyHours,
        annual_hours:   annualHours,
        monthly_limit:  monthlyLimit,
        annual_limit:   annualLimit,
        alert_hours:    alertHours,
        monthly_status: monthlyStatus,
        annual_status:  annualStatus,
        status:         worstStatus,
      }
    })

    // 危険→警告→正常の順にソート
    alerts.sort((a, b) => {
      const order: Record<string, number> = { danger: 0, warning: 1, ok: 2 }
      return order[a.status] - order[b.status]
    })

    return NextResponse.json({ alerts, year, month, monthly_limit: monthlyLimit, annual_limit: annualLimit })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

// 警告・超過レベルの社員に対して、管理者へメール一括送信
export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 })
    }

    const { year, month } = await request.json() as { year: number; month: number }
    const db = withCompany(payload.company_id)

    const yearFrom  = `${year}-01-01`
    const yearTo    = `${year}-12-31`
    const monthFrom = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay   = new Date(year, month, 0).getDate()
    const monthTo   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const [usersRes, attYearRes, workRuleRes, managersRes] = await Promise.all([
      db.select('users', 'id, name, employee_code, email').eq('is_active', true),
      db.select('attendance_records', 'user_id, overtime_minutes, work_date')
        .gte('work_date', yearFrom).lte('work_date', yearTo),
      db.select('work_rules', 'overtime_limit_hours, overtime_annual_limit, overtime_alert_hours').limit(1).single(),
      db.select('users', 'email').in('role', ['manager', 'admin']).eq('is_active', true),
    ])

    const users   = (usersRes.data    ?? []) as unknown as UserRow[]
    const attRows = (attYearRes.data  ?? []) as unknown as AttRow[]
    const rule    = (workRuleRes.data as unknown as WorkRuleRow | null) ?? { overtime_limit_hours: 45, overtime_annual_limit: 360, overtime_alert_hours: 36 }
    const monthlyLimit = Number(rule.overtime_limit_hours)
    const alertHours   = Number(rule.overtime_alert_hours)

    const managerEmails = ((managersRes.data ?? []) as unknown as { email: string | null }[])
      .map((u) => u.email).filter(Boolean) as string[]

    function toHours(mins: number) { return Math.round(mins / 6) / 10 }

    const monthlyMap = new Map<string, number>()
    for (const r of attRows) {
      if (r.work_date >= monthFrom && r.work_date <= monthTo) {
        monthlyMap.set(r.user_id, (monthlyMap.get(r.user_id) ?? 0) + (r.overtime_minutes ?? 0))
      }
    }

    const toNotify = users.filter((u) => {
      const h = toHours(monthlyMap.get(u.id) ?? 0)
      return h >= alertHours
    })

    if (managerEmails.length > 0) {
      await Promise.allSettled(
        toNotify.map((u) => {
          const h = toHours(monthlyMap.get(u.id) ?? 0)
          return sendOvertimeAlert({
            to:            managerEmails,
            employeeName:  u.name,
            year,
            month,
            overtimeHours: h,
            level:         h >= monthlyLimit ? 'critical' : 'warning',
          })
        })
      )
    }

    return NextResponse.json({ sent: toNotify.length, recipients: managerEmails.length })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
