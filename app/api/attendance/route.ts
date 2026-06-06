import { NextRequest, NextResponse } from 'next/server'
import { withCompany, getCompanyId, getUserId } from '@/lib/db/withCompany'
import type { AttendanceRecord, ApiError } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const companyId = getCompanyId(request)
    const userId = getUserId(request)
    const db = withCompany(companyId)

    const url = new URL(request.url)
    const year = url.searchParams.get('year')
    const month = url.searchParams.get('month')

    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    const targetYear = year ? parseInt(year) : now.getFullYear()
    const targetMonth = month ? parseInt(month) : now.getMonth() + 1

    const from = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`
    const lastDay = new Date(targetYear, targetMonth, 0).getDate()
    const to = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const { data: records, error } = await db
      .select('attendance_records')
      .eq('user_id', userId)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date', { ascending: true })

    if (error) {
      return NextResponse.json<ApiError>({ error: 'データ取得に失敗しました' }, { status: 500 })
    }

    const typedRecords = (records ?? []) as unknown as AttendanceRecord[]
    const summary = {
      total_days: typedRecords.filter((r) => r.status === 'present').length,
      total_minutes: typedRecords.reduce((sum, r) => sum + (r.actual_minutes ?? 0), 0),
      overtime_minutes: typedRecords.reduce((sum, r) => sum + (r.overtime_minutes ?? 0), 0),
      night_minutes: typedRecords.reduce((sum, r) => sum + r.night_minutes, 0),
      holiday_work_days: typedRecords.filter((r) => r.is_holiday_work).length,
      period: { from, to },
    }

    return NextResponse.json({ records: typedRecords, summary })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
