import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ComplianceSummary } from '@/lib/types'

type AttRow      = { work_date: string; status: string; overtime_minutes: number | null }
type ClockRow    = { work_date: string; clock_in: string | null; clock_out: string | null }
type LeaveRow    = { total_days: number; used_days: number }
type WorkRuleRow = { overtime_limit_hours: number; overtime_annual_limit: number; overtime_alert_hours: number }

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const userId  = payload.user_id
    const db      = withCompany(payload.company_id)

    const url   = new URL(request.url)
    const now   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    const year  = parseInt(url.searchParams.get('year')  ?? String(now.getFullYear()))
    const month = parseInt(url.searchParams.get('month') ?? String(now.getMonth() + 1))

    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay    = new Date(year, month, 0).getDate()
    const monthEnd   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const yearStart  = `${year}-01-01`
    const today      = now.toLocaleDateString('sv', { timeZone: 'Asia/Tokyo' })

    const d90 = new Date(now)
    d90.setDate(d90.getDate() - 90)
    const ninetyDaysAgo = d90.toLocaleDateString('sv', { timeZone: 'Asia/Tokyo' })

    const [leaveRes, annualOTRes, monthlyOTRes, recentAttRes, clockRes, workRuleRes] = await Promise.all([
      db.select('leave_balances', 'total_days, used_days')
        .eq('user_id', userId)
        .order('fiscal_year', { ascending: false })
        .limit(1),

      db.select('attendance_records', 'overtime_minutes')
        .eq('user_id', userId)
        .gte('work_date', yearStart)
        .lte('work_date', monthEnd),

      db.select('attendance_records', 'overtime_minutes')
        .eq('user_id', userId)
        .gte('work_date', monthStart)
        .lte('work_date', monthEnd),

      db.select('attendance_records', 'work_date, status')
        .eq('user_id', userId)
        .lte('work_date', today)
        .gte('work_date', ninetyDaysAgo)
        .order('work_date', { ascending: false }),

      db.select('attendance_records', 'work_date, clock_in, clock_out')
        .eq('user_id', userId)
        .not('clock_out', 'is', null)
        .order('work_date', { ascending: false })
        .limit(2),

      db.select('work_rules', 'overtime_limit_hours, overtime_annual_limit, overtime_alert_hours')
        .limit(1)
        .single(),
    ])

    const leaveRow    = ((leaveRes.data   ?? []) as unknown as LeaveRow[])[0]   ?? null
    const annualRows  = (annualOTRes.data  ?? []) as unknown as AttRow[]
    const monthlyRows = (monthlyOTRes.data ?? []) as unknown as AttRow[]
    const recentAtt   = (recentAttRes.data ?? []) as unknown as AttRow[]
    const clockRows   = (clockRes.data     ?? []) as unknown as ClockRow[]
    const rule        = (workRuleRes.data  as unknown as WorkRuleRow | null) ?? {
      overtime_limit_hours:  45,
      overtime_annual_limit: 360,
      overtime_alert_hours:  36,
    }

    const paid_leave_remaining        = leaveRow ? Math.max(0, leaveRow.total_days - leaveRow.used_days) : 0
    const monthly_overtime_minutes    = monthlyRows.reduce((s, r) => s + (r.overtime_minutes ?? 0), 0)
    const annual_overtime_minutes     = annualRows .reduce((s, r) => s + (r.overtime_minutes ?? 0), 0)

    let consecutive_work_days = 0
    for (const r of recentAtt) {
      if (r.status === 'present') {
        consecutive_work_days++
      } else {
        break
      }
    }

    let interval_ok    = true
    let last_clock_out: string | null = null
    if (clockRows.length > 0) {
      last_clock_out = clockRows[0].clock_out
    }
    if (clockRows.length >= 2) {
      const prevClockOut = clockRows[1].clock_out
      const nextClockIn  = clockRows[0].clock_in
      if (prevClockOut && nextClockIn) {
        const diffMs    = new Date(nextClockIn).getTime() - new Date(prevClockOut).getTime()
        interval_ok     = diffMs >= 11 * 60 * 60 * 1000
      }
    }

    const summary: ComplianceSummary = {
      paid_leave_remaining,
      monthly_overtime_minutes,
      annual_overtime_minutes,
      consecutive_work_days,
      last_clock_out,
      interval_ok,
      work_rules: {
        overtime_limit_hours:  Number(rule.overtime_limit_hours  ?? 45),
        overtime_annual_limit: Number(rule.overtime_annual_limit ?? 360),
        overtime_alert_hours:  Number(rule.overtime_alert_hours  ?? 36),
      },
    }

    return NextResponse.json({ summary })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
