import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError, AttendanceRecord, BreakLog } from '@/lib/types'

function getTodayJST(): string {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return jst.toISOString().split('T')[0]
}

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const { company_id: companyId, user_id: userId } = payload
    const db = withCompany(companyId)

    const { data: record } = await db
      .select('attendance_records', 'id, clock_in, clock_out, is_locked')
      .eq('user_id', userId)
      .eq('work_date', getTodayJST())
      .single()

    const typedRecord = record as unknown as AttendanceRecord | null

    if (!typedRecord?.clock_in) {
      return NextResponse.json<ApiError>({ error: '出勤打刻がありません' }, { status: 400 })
    }
    if (typedRecord.clock_out) {
      return NextResponse.json<ApiError>(
        { error: 'すでに退勤済みです', code: 'ALREADY_CLOCKED_OUT' },
        { status: 409 }
      )
    }
    if (typedRecord.is_locked) {
      return NextResponse.json<ApiError>({ error: '締め済みのため操作できません' }, { status: 403 })
    }

    const { data: activeBreak } = await db
      .select('break_logs', 'id')
      .eq('attendance_id', typedRecord.id)
      .is('break_end', null)
      .single()

    if (activeBreak) {
      return NextResponse.json<ApiError>(
        { error: 'すでに休憩中です', code: 'ALREADY_ON_BREAK' },
        { status: 409 }
      )
    }

    const breakStart = new Date().toISOString()
    const { data: breakLog, error } = await db.insert('break_logs', {
      attendance_id: typedRecord.id,
      break_start: breakStart,
    })

    if (error) {
      console.error('break-start error:', error)
      return NextResponse.json<ApiError>({ error: '休憩開始に失敗しました' }, { status: 500 })
    }

    const inserted = (Array.isArray(breakLog) ? breakLog[0] : breakLog) as unknown as BreakLog
    return NextResponse.json({ break_start: inserted?.break_start ?? breakStart })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
