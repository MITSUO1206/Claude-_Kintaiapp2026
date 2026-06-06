import { NextRequest, NextResponse } from 'next/server'
import { withCompany, getCompanyId, getUserId } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError } from '@/lib/types'

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
    const clockIn = new Date().toISOString()

    const { data: existing } = await db
      .select('attendance_records', 'id, clock_in')
      .eq('user_id', userId)
      .eq('work_date', workDate)
      .single()

    if (existing) {
      return NextResponse.json<ApiError>(
        { error: '本日はすでに出勤打刻済みです', code: 'DUPLICATE_CLOCK_IN' },
        { status: 409 }
      )
    }

    const { data: record, error } = await db.insert('attendance_records', {
      user_id: userId,
      work_date: workDate,
      clock_in: clockIn,
      status: 'present',
    })

    if (error) {
      console.error('clock-in error:', error)
      return NextResponse.json<ApiError>({ error: '打刻に失敗しました' }, { status: 500 })
    }

    await writeAuditLog({
      company_id: companyId,
      user_id: userId,
      action: 'clock_in',
      table_name: 'attendance_records',
      new_values: { work_date: workDate, clock_in: clockIn },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    const inserted = Array.isArray(record) ? record[0] : record
    return NextResponse.json({ record: inserted })
  } catch (error) {
    console.error('clock-in unexpected error:', error)
    return NextResponse.json<ApiError>({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
