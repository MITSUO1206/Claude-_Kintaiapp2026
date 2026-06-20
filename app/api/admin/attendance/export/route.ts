import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError, AttendanceRecord } from '@/lib/types'

type UserRow    = { id: string; employee_code: string; name: string; salary_type: string; work_rule_pattern_id: string | null }
type PatternRow = { id: string; start_time: string; end_time: string }

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }

    const db = withCompany(payload.company_id)
    const url = new URL(request.url)
    const yearParam   = url.searchParams.get('year')
    const monthParam  = url.searchParams.get('month')
    const fromParam   = url.searchParams.get('from')
    const toParam     = url.searchParams.get('to')
    const userIdParam = url.searchParams.get('user_id')

    if (!yearParam && !fromParam) {
      return NextResponse.json<ApiError>(
        { error: '年・月またはfrom/toを指定してください' },
        { status: 400 }
      )
    }

    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    let from: string
    let to: string
    if (fromParam && toParam) {
      from = fromParam
      to   = toParam
    } else {
      const y = parseInt(yearParam!)
      const m = parseInt(monthParam ?? String(now.getMonth() + 1))
      from = `${y}-${String(m).padStart(2, '0')}-01`
      const lastDay = new Date(y, m, 0).getDate()
      to   = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    }

    let usersQuery = db.select('users', 'id, employee_code, name, salary_type, work_rule_pattern_id').eq('is_active', true)
    if (userIdParam) usersQuery = usersQuery.eq('id', userIdParam)
    const [{ data: users }, { data: records }, { data: patterns }] = await Promise.all([
      usersQuery.order('employee_code', { ascending: true }),
      db.select('attendance_records').gte('work_date', from).lte('work_date', to),
      db.select('work_rule_patterns', 'id, start_time, end_time'),
    ])

    const typedUsers    = (users    ?? []) as unknown as UserRow[]
    const typedRecords  = (records  ?? []) as unknown as AttendanceRecord[]
    const patternMap    = new Map(((patterns ?? []) as unknown as PatternRow[]).map((p) => [p.id, p]))

    const period = yearParam
      ? `${yearParam}年${monthParam ?? ''}月`
      : `${from}〜${to}`

    const BOM = '﻿'
    const headers = [
      '社員番号', '氏名', '雇用形態', '勤務パターン', '対象年月',
      '出勤日数', '実働時間(h)', '残業時間(h)',
      '深夜時間(h)', '休日出勤日数', '有給取得日数',
    ]

    const rows = typedUsers.map((user) => {
      const userRecords = typedRecords.filter((r) => r.user_id === user.id)
      const total_days   = userRecords.filter((r) => r.status === 'present').length
      const total_min    = userRecords.reduce((s, r) => s + (r.actual_minutes   ?? 0), 0)
      const ot_min       = userRecords.reduce((s, r) => s + (r.overtime_minutes ?? 0), 0)
      const night_min    = userRecords.reduce((s, r) => s + r.night_minutes, 0)
      const holiday_days = userRecords.filter((r) => r.is_holiday_work).length
      const leave_days   = userRecords.filter((r) => r.status === 'leave_paid').length
      const salaryLabel  = user.salary_type === 'monthly' ? '月給' : '時給'
      const pattern      = user.work_rule_pattern_id ? patternMap.get(user.work_rule_pattern_id) : null
      const patternLabel = pattern
        ? `${pattern.start_time.slice(0, 5)}〜${pattern.end_time.slice(0, 5)}`
        : 'デフォルト'

      return [
        user.employee_code,
        user.name,
        salaryLabel,
        patternLabel,
        period,
        total_days,
        (total_min / 60).toFixed(1),
        (ot_min   / 60).toFixed(1),
        (night_min / 60).toFixed(1),
        holiday_days,
        leave_days,
      ].map(String)
    })

    const csvContent =
      BOM +
      [headers, ...rows]
        .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
        .join('\r\n')

    const filename = yearParam
      ? `kintai_${yearParam}${String(monthParam ?? '').padStart(2, '0')}.csv`
      : `kintai_${from}_${to}.csv`

    await writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'attendance_csv_export',
      new_values: { period, user_id: userIdParam ?? 'all' },
    })

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8-sig',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
