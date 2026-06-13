import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError, AttendanceRecord } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }

    const url = new URL(request.url)
    const userId = url.searchParams.get('user_id')
    if (!userId) {
      return NextResponse.json<ApiError>({ error: 'user_id is required' }, { status: 400 })
    }

    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    const year  = parseInt(url.searchParams.get('year')  ?? String(now.getFullYear()))
    const month = parseInt(url.searchParams.get('month') ?? String(now.getMonth() + 1))
    const from = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const db = withCompany(payload.company_id)

    const { data, error } = await db
      .select('attendance_records')
      .eq('user_id', userId)
      .gte('work_date', from)
      .lte('work_date', to)
      .order('work_date', { ascending: true })

    if (error) {
      return NextResponse.json<ApiError>({ error: '取得に失敗しました' }, { status: 500 })
    }

    const records = (data ?? []) as unknown as AttendanceRecord[]
    return NextResponse.json({ records })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
