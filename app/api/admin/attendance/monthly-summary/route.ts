import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError } from '@/lib/types'

type AttRow = {
  user_id: string
  actual_minutes: number | null
  overtime_minutes: number | null
  status: string
}

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: '権限がありません' }, { status: 403 })
    }

    const url = new URL(request.url)
    const year  = parseInt(url.searchParams.get('year')  ?? '')
    const month = parseInt(url.searchParams.get('month') ?? '')
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json<ApiError>({ error: '年月が不正です' }, { status: 400 })
    }

    const fromDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay  = new Date(year, month, 0).getDate()
    const toDate   = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const db = withCompany(payload.company_id)
    const { data } = await db
      .select('attendance_records', 'user_id, actual_minutes, overtime_minutes, status')
      .gte('work_date', fromDate)
      .lte('work_date', toDate)

    const rows = (data ?? []) as unknown as AttRow[]

    // ユーザーごとに集計
    const summaryMap = new Map<string, { actual_minutes: number; overtime_minutes: number; work_days: number; absent_days: number }>()
    for (const r of rows) {
      const cur = summaryMap.get(r.user_id) ?? { actual_minutes: 0, overtime_minutes: 0, work_days: 0, absent_days: 0 }
      cur.actual_minutes   += r.actual_minutes   ?? 0
      cur.overtime_minutes += r.overtime_minutes ?? 0
      if (r.status === 'present') cur.work_days++
      if (r.status === 'absent')  cur.absent_days++
      summaryMap.set(r.user_id, cur)
    }

    const summary = Array.from(summaryMap.entries()).map(([user_id, s]) => ({
      user_id,
      actual_hours:   Math.round(s.actual_minutes   / 6) / 10,
      overtime_hours: Math.round(s.overtime_minutes / 6) / 10,
      work_days:      s.work_days,
      absent_days:    s.absent_days,
    }))

    return NextResponse.json({ summary })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
