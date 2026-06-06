import { NextRequest, NextResponse } from 'next/server'
import { withCompany, getCompanyId, getUserId } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { AttendanceRecord, ApiError } from '@/lib/types'

function getTodayJST(): string {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return jst.toISOString().split('T')[0]
}

export async function POST(request: NextRequest) {
  try {
    const companyId = getCompanyId(request)
    const userId = getUserId(request)
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

    const clockInTime = new Date(typedRecord.clock_in!).getTime()
    const actualMinutes = Math.floor(
      (new Date(clockOut).getTime() - clockInTime) / 60000 - typedRecord.break_minutes
    )

    const { error: updateError } = await db
      .update('attendance_records', { clock_out: clockOut, actual_minutes: actualMinutes })
      .eq('id', typedRecord.id)

    if (updateError) {
      return NextResponse.json<ApiError>({ error: '退勤打刻に失敗しました' }, { status: 500 })
    }

    await writeAuditLog({
      company_id: companyId,
      user_id: userId,
      action: 'clock_out',
      table_name: 'attendance_records',
      record_id: typedRecord.id,
      new_values: { clock_out: clockOut, actual_minutes: actualMinutes },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({
      record: { ...typedRecord, clock_out: clockOut, actual_minutes: actualMinutes },
    })
  } catch (error) {
    console.error('clock-out error:', error)
    return NextResponse.json<ApiError>({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
