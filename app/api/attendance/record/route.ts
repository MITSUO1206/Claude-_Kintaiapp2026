import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { AttendanceRecord, ApiError } from '@/lib/types'

// "HH:MM" + "YYYY-MM-DD" → JST の ISO 文字列
function toJSTTimestamp(date: string, time: string): string {
  return `${date}T${time}:00+09:00`
}

// HH:MM 形式チェック（値域も検証）
function isValidTime(t: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(t)) return false
  const [h, m] = t.split(':').map(Number)
  return h >= 0 && h <= 23 && m >= 0 && m <= 59
}

export async function PUT(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const { company_id: companyId, user_id: userId } = payload
    const db = withCompany(companyId)

    const body = await request.json()
    const { work_date, clock_in, clock_out, break_minutes, work_location } = body as {
      work_date: string
      clock_in: string | null
      clock_out: string | null
      break_minutes: number
      work_location: string | null
    }

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

    const VALID_LOCATIONS = ['office', 'home', 'satellite', 'other'] as const
    if (work_location !== null && work_location !== undefined && !(VALID_LOCATIONS as readonly string[]).includes(work_location)) {
      return NextResponse.json<ApiError>({ error: '就業場所の値が不正です' }, { status: 400 })
    }

    // actual_minutes 計算
    let actualMinutes: number | null = null
    let overtimeMinutes: number | null = null

    if (clock_in && clock_out) {
      const inMs  = new Date(toJSTTimestamp(work_date, clock_in)).getTime()
      const outMs = new Date(toJSTTimestamp(work_date, clock_out)).getTime()
      if (outMs <= inMs) {
        return NextResponse.json<ApiError>({ error: '退勤時刻は出勤時刻より後にしてください' }, { status: 400 })
      }
      actualMinutes = Math.max(0, Math.floor((outMs - inMs) / 60000) - break_minutes)

      // work_rules から所定労働時間を取得して残業計算
      const { data: wr } = await db.select('work_rules', 'work_hours_per_day').single()
      type WR = { work_hours_per_day: number }
      const scheduledMinutes = Math.round(((wr as unknown as WR | null)?.work_hours_per_day ?? 8) * 60)
      overtimeMinutes = Math.max(0, actualMinutes - scheduledMinutes)
    }

    // 既存レコード確認
    const { data: existing } = await db
      .select('attendance_records', 'id, is_locked')
      .eq('user_id', userId)
      .eq('work_date', work_date)
      .single()

    type ExRow = { id: string; is_locked: boolean }
    const ex = existing as unknown as ExRow | null

    if (ex?.is_locked) {
      return NextResponse.json<ApiError>({ error: '締め済みのため編集できません' }, { status: 403 })
    }

    const clockInISO  = clock_in  ? toJSTTimestamp(work_date, clock_in)  : null
    const clockOutISO = clock_out ? toJSTTimestamp(work_date, clock_out) : null

    let record: AttendanceRecord

    if (ex) {
      const { data, error } = await db
        .update('attendance_records', {
          clock_in:         clockInISO,
          clock_out:        clockOutISO,
          break_minutes,
          actual_minutes:   actualMinutes,
          overtime_minutes: overtimeMinutes,
          work_location:    work_location ?? null,
          status:           'present',
        })
        .eq('id', ex.id)
        .select()
        .single()
      if (error) {
        return NextResponse.json<ApiError>({ error: '保存に失敗しました' }, { status: 500 })
      }
      record = data as unknown as AttendanceRecord
    } else {
      const { data, error } = await db.insert('attendance_records', {
        user_id:          userId,
        work_date,
        clock_in:         clockInISO,
        clock_out:        clockOutISO,
        break_minutes,
        actual_minutes:   actualMinutes,
        overtime_minutes: overtimeMinutes,
        night_minutes:    0,
        holiday_minutes:  0,
        is_holiday_work:  false,
        is_locked:        false,
        work_location:    work_location ?? null,
        status:           'present',
      })
      if (error) {
        return NextResponse.json<ApiError>({ error: '保存に失敗しました' }, { status: 500 })
      }
      const inserted = Array.isArray(data) ? data[0] : data
      record = inserted as unknown as AttendanceRecord
    }

    void writeAuditLog({
      company_id: companyId,
      user_id:    userId,
      action:     'attendance_record_save',
      table_name: 'attendance_records',
      record_id:  record.id,
      new_values: { work_date, clock_in, clock_out, break_minutes, work_location },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ record })
  } catch (error) {
    console.error('attendance record PUT error:', error)
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
