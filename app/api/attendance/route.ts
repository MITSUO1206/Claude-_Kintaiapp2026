import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { AttendanceRecord, ApiError } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const db = withCompany(payload.company_id)

    const url = new URL(request.url)
    const yearParam  = url.searchParams.get('year')
    const monthParam = url.searchParams.get('month')
    const fromParam  = url.searchParams.get('from')
    const toParam    = url.searchParams.get('to')
    const statusParam   = url.searchParams.get('status')
    const overtimeParam = url.searchParams.get('overtime')

    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))

    let from: string
    let to: string

    if (fromParam && toParam) {
      const diffMs = new Date(toParam).getTime() - new Date(fromParam).getTime()
      const diffDays = diffMs / (1000 * 60 * 60 * 24)
      if (diffDays > 366) {
        return NextResponse.json<ApiError>(
          { error: '検索期間は最大 12 ヶ月です' },
          { status: 400 }
        )
      }
      if (new Date(fromParam) > new Date(toParam)) {
        return NextResponse.json<ApiError>(
          { error: '開始日は終了日より前にしてください' },
          { status: 400 }
        )
      }
      from = fromParam
      to   = toParam
    } else {
      const targetYear  = yearParam  ? parseInt(yearParam)  : now.getFullYear()
      const targetMonth = monthParam ? parseInt(monthParam) : now.getMonth() + 1
      from = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`
      const lastDay = new Date(targetYear, targetMonth, 0).getDate()
      to   = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    }

    let query = db
      .select('attendance_records')
      .eq('user_id', payload.user_id)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date', { ascending: true })

    if (statusParam) {
      query = query.eq('status', statusParam)
    }
    if (overtimeParam === 'true') {
      query = query.gt('overtime_minutes', 0)
    }

    const { data: records, error } = await query

    if (error) {
      return NextResponse.json<ApiError>({ error: 'データ取得に失敗しました' }, { status: 500 })
    }

    const typedRecords = (records ?? []) as unknown as AttendanceRecord[]
    const summary = {
      total_days:       typedRecords.filter((r) => r.status === 'present').length,
      total_minutes:    typedRecords.reduce((s, r) => s + (r.actual_minutes   ?? 0), 0),
      overtime_minutes: typedRecords.reduce((s, r) => s + (r.overtime_minutes ?? 0), 0),
      night_minutes:    typedRecords.reduce((s, r) => s + r.night_minutes, 0),
      holiday_work_days: typedRecords.filter((r) => r.is_holiday_work).length,
      period: { from, to },
    }

    return NextResponse.json({ records: typedRecords, summary })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
