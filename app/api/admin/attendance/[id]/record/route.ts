import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { AttendanceRecord, ApiError } from '@/lib/types'

function toJSTTimestamp(date: string, time: string): string {
  return `${date}T${time}:00+09:00`
}

function isValidTime(t: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(t)) return false
  const [h, m] = t.split(':').map(Number)
  return h >= 0 && h <= 23 && m >= 0 && m <= 59
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }

    const { id: userId } = await params
    const body = await request.json() as {
      work_date: string
      clock_in: string | null
      clock_out: string | null
      break_minutes: number
      work_location: string | null
    }

    const { work_date, clock_in, clock_out, break_minutes, work_location } = body

    if (!work_date || !/^\d{4}-\d{2}-\d{2}$/.test(work_date)) {
      return NextResponse.json<ApiError>({ error: '日付が不正です' }, { status: 400 })
    }
    if (clock_in && !isValidTime(clock_in)) {
      return NextResponse.json<ApiError>({ error: '出勤時刻の形式が不正です (HH:MM)' }, { status: 400 })
    }
    if (clock_out && !isValidTime(clock_out)) {
      return NextResponse.json<ApiError>({ error: '退勤時刻の形式が不正です (HH:MM)' }, { status: 400 })
    }
    if (typeof break_minutes !== 'number' || break_minutes < 0) {
      return NextResponse.json<ApiError>({ error: '休憩時間が不正です' }, { status: 400 })
    }

    const db = withCompany(payload.company_id)

    const { data: userCheck } = await db.select('users', 'id').eq('id', userId).single()
    if (!userCheck) {
      return NextResponse.json<ApiError>({ error: '社員が見つかりません' }, { status: 404 })
    }

    let actualMinutes: number | null = null
    let overtimeMinutes: number | null = null

    if (clock_in && clock_out) {
      const inMs  = new Date(toJSTTimestamp(work_date, clock_in)).getTime()
      const outMs = new Date(toJSTTimestamp(work_date, clock_out)).getTime()
      if (outMs <= inMs) {
        return NextResponse.json<ApiError>({ error: '退勤時刻は出勤時刻より後にしてください' }, { status: 400 })
      }
      actualMinutes = Math.max(0, Math.floor((outMs - inMs) / 60000) - break_minutes)
      const { data: wr } = await db.select('work_rules', 'work_hours_per_day').single()
      type WR = { work_hours_per_day: number }
      const scheduledMin = Math.round(((wr as unknown as WR | null)?.work_hours_per_day ?? 8) * 60)
      overtimeMinutes = Math.max(0, actualMinutes - scheduledMin)
    }

    const { data: existing } = await db
      .select('attendance_records', 'id, is_locked')
      .eq('user_id', userId)
      .eq('work_date', work_date)
      .single()

    type ExRow = { id: string; is_locked: boolean }
    const ex = existing as unknown as ExRow | null

    const clockInISO  = clock_in  ? toJSTTimestamp(work_date, clock_in)  : null
    const clockOutISO = clock_out ? toJSTTimestamp(work_date, clock_out) : null

    let record: AttendanceRecord

    if (ex) {
      const { data, error } = await db
        .update('attendance_records', {
          clock_in: clockInISO,
          clock_out: clockOutISO,
          break_minutes,
          actual_minutes: actualMinutes,
          overtime_minutes: overtimeMinutes,
          work_location: work_location ?? null,
          status: 'present',
        })
        .eq('id', ex.id)
        .select()
        .single()
      if (error) {
        return NextResponse.json<ApiError>({ error: '更新に失敗しました' }, { status: 500 })
      }
      record = data as unknown as AttendanceRecord
    } else {
      const { data, error } = await db.insert('attendance_records', {
        user_id: userId,
        work_date,
        clock_in: clockInISO,
        clock_out: clockOutISO,
        break_minutes,
        actual_minutes: actualMinutes,
        overtime_minutes: overtimeMinutes,
        night_minutes: 0,
        holiday_minutes: 0,
        is_holiday_work: false,
        is_locked: false,
        work_location: work_location ?? null,
        status: 'present',
      })
      if (error) {
        return NextResponse.json<ApiError>({ error: '保存に失敗しました' }, { status: 500 })
      }
      const inserted = Array.isArray(data) ? data[0] : data
      record = inserted as unknown as AttendanceRecord
    }

    void writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'admin_attendance_record_save',
      table_name: 'attendance_records',
      record_id: record.id,
      new_values: { target_user_id: userId, work_date, clock_in, clock_out, break_minutes },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ record })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
