import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError } from '@/lib/types'

function getTodayJST(): string {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return jst.toISOString().split('T')[0]
}

type UserRow = { id: string; employee_code: string; name: string; role: string }
type RecordRow = { user_id: string; clock_in: string | null; clock_out: string | null }

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)

    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }

    const db = withCompany(payload.company_id)
    const today = getTodayJST()

    const { data: users, error: usersError } = await db
      .select('users', 'id, employee_code, name, role')
      .eq('is_active', true)
      .order('employee_code', { ascending: true })

    if (usersError) {
      return NextResponse.json<ApiError>({ error: 'データ取得に失敗しました' }, { status: 500 })
    }

    const { data: todayRecords } = await db
      .select('attendance_records', 'user_id, clock_in, clock_out')
      .eq('work_date', today)

    const recordMap = new Map(
      ((todayRecords ?? []) as unknown as RecordRow[]).map((r) => [r.user_id, r])
    )

    const result = ((users ?? []) as unknown as UserRow[]).map((user) => {
      const r = recordMap.get(user.id)
      return {
        ...user,
        today_status: r ? (r.clock_out ? 'clocked_out' : 'clocked_in') : 'not_clocked',
        clock_in: r?.clock_in ?? null,
      }
    })

    return NextResponse.json({ users: result, date: today })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
