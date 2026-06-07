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
      .select('attendance_records', 'id')
      .eq('user_id', userId)
      .eq('work_date', getTodayJST())
      .single()

    const typedRecord = record as unknown as AttendanceRecord | null
    if (!typedRecord) {
      return NextResponse.json<ApiError>({ error: '出勤打刻がありません' }, { status: 400 })
    }

    const { data: activeBreak } = await db
      .select('break_logs', 'id, break_start')
      .eq('attendance_id', typedRecord.id)
      .is('break_end', null)
      .single()

    if (!activeBreak) {
      return NextResponse.json<ApiError>(
        { error: '休憩を開始していません', code: 'NOT_ON_BREAK' },
        { status: 400 }
      )
    }

    const typedBreak = activeBreak as unknown as BreakLog
    const breakEnd = new Date().toISOString()

    const { error: updateBreakError } = await db
      .update('break_logs', { break_end: breakEnd })
      .eq('id', typedBreak.id)

    if (updateBreakError) {
      return NextResponse.json<ApiError>({ error: '休憩終了に失敗しました' }, { status: 500 })
    }

    // 全完了休憩から break_minutes を再計算してキャッシュ
    const { data: allBreaks } = await db
      .select('break_logs', 'break_start, break_end')
      .eq('attendance_id', typedRecord.id)
      .not('break_end', 'is', null)

    const totalBreakMinutes = ((allBreaks ?? []) as unknown as BreakLog[]).reduce((sum, b) => {
      return sum + Math.floor(
        (new Date(b.break_end!).getTime() - new Date(b.break_start).getTime()) / 60000
      )
    }, 0)

    await db
      .update('attendance_records', { break_minutes: totalBreakMinutes })
      .eq('id', typedRecord.id)

    return NextResponse.json({ break_minutes: totalBreakMinutes })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
