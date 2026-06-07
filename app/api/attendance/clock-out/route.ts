import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { AttendanceRecord, BreakLog, ApiError } from '@/lib/types'

function getTodayJST(): string {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return jst.toISOString().split('T')[0]
}

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const { company_id: companyId, user_id: userId } = payload
    const db = withCompany(companyId)

    const workDate = getTodayJST()
    const clockOut = new Date().toISOString()

    const { data: record, error: fetchError } = await db
      .select('attendance_records')
      .eq('user_id', userId)
      .eq('work_date', workDate)
      .single()

    if (fetchError || !record) {
      return NextResponse.json<ApiError>(
        { error: '本日の出勤打刻がありません' },
        { status: 400 }
      )
    }

    const typedRecord = record as unknown as AttendanceRecord

    if (typedRecord.is_locked) {
      return NextResponse.json<ApiError>({ error: '締め済みのため操作できません' }, { status: 403 })
    }
    if (typedRecord.clock_out) {
      return NextResponse.json<ApiError>({ error: 'すでに退勤打刻済みです' }, { status: 409 })
    }

    const { data: activeBreak } = await db
      .select('break_logs', 'id, break_start')
      .eq('attendance_id', typedRecord.id)
      .is('break_end', null)
      .single()

    if (activeBreak) {
      await db
        .update('break_logs', { break_end: clockOut })
        .eq('id', (activeBreak as unknown as BreakLog).id)
    }

    const { data: allBreaks } = await db
      .select('break_logs', 'break_start, break_end')
      .eq('attendance_id', typedRecord.id)
      .not('break_end', 'is', null)

    const totalBreakMinutes = ((allBreaks ?? []) as unknown as BreakLog[]).reduce((sum, b) => {
      return sum + Math.floor(
        (new Date(b.break_end!).getTime() - new Date(b.break_start).getTime()) / 60000
      )
    }, 0)

    const actualMinutes = Math.max(
      0,
      Math.floor(
        (new Date(clockOut).getTime() - new Date(typedRecord.clock_in!).getTime()) / 60000
      ) - totalBreakMinutes
    )

    const { data: workRule } = await db.select('work_rules', 'work_hours_per_day, overtime_alert_hours, overtime_limit_hours').single()
    type WR = { work_hours_per_day: number; overtime_alert_hours: number; overtime_limit_hours: number }
    const wr = (workRule as unknown as WR | null) ?? { work_hours_per_day: 8, overtime_alert_hours: 36, overtime_limit_hours: 45 }
    const scheduledMinutes = Math.round(wr.work_hours_per_day * 60)
    const overtimeMinutes = Math.max(0, actualMinutes - scheduledMinutes)

    const { error: updateError } = await db
      .update('attendance_records', {
        clock_out: clockOut,
        break_minutes: totalBreakMinutes,
        actual_minutes: actualMinutes,
        overtime_minutes: overtimeMinutes,
      })
      .eq('id', typedRecord.id)

    if (updateError) {
      return NextResponse.json<ApiError>({ error: '退勤打刻に失敗しました' }, { status: 500 })
    }

    // 36協定アラート確認
    try {
      const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
      const monthFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

      const { data: monthRecords } = await db
        .select('attendance_records', 'overtime_minutes')
        .eq('user_id', userId)
        .gte('work_date', monthFrom)

      type OTRow = { overtime_minutes: number | null }
      const totalOvertimeMinutesPrev = ((monthRecords ?? []) as unknown as OTRow[])
        .reduce((s, r) => s + (r.overtime_minutes ?? 0), 0) - overtimeMinutes
      const totalOvertimeMinutes = totalOvertimeMinutesPrev + overtimeMinutes
      const prevH = totalOvertimeMinutesPrev / 60
      const newH = totalOvertimeMinutes / 60

      const alertH = wr.overtime_alert_hours
      const limitH = wr.overtime_limit_hours

      let alertLevel: 'warning' | 'critical' | null = null
      if (prevH < limitH && newH >= limitH) alertLevel = 'critical'
      else if (prevH < alertH && newH >= alertH) alertLevel = 'warning'

      if (alertLevel) {
        const { data: managers } = await db
          .select('users', 'email, name')
          .in('role', ['admin', 'manager'])
          .eq('is_active', true)
          .not('email', 'is', null)

        const { data: employee } = await db.select('users', 'name').eq('id', userId).single()
        type UserRow = { email: string | null; name: string }
        const managerEmails = ((managers ?? []) as unknown as UserRow[])
          .filter((u) => u.email)
          .map((u) => u.email as string)

        if (managerEmails.length > 0) {
          const { sendOvertimeAlert } = await import('@/lib/email/resend')
          await sendOvertimeAlert({
            to: managerEmails,
            employeeName: (employee as unknown as UserRow | null)?.name ?? '不明',
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            overtimeHours: newH,
            level: alertLevel,
          })
        }
      }
    } catch (e) {
      console.error('overtime alert error:', e)
    }

    await writeAuditLog({
      company_id: companyId,
      user_id: userId,
      action: 'clock_out',
      table_name: 'attendance_records',
      record_id: typedRecord.id,
      new_values: { clock_out: clockOut, actual_minutes: actualMinutes, overtime_minutes: overtimeMinutes },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({
      record: { ...typedRecord, clock_out: clockOut, actual_minutes: actualMinutes, overtime_minutes: overtimeMinutes },
    })
  } catch (error) {
    console.error('clock-out error:', error)
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
