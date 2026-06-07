import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: '権限がありません' }, { status: 403 })
    }

    const db = withCompany(payload.company_id)

    const { data, error } = await db
      .select('requests', 'id, type, target_date, reason, note, created_at, user_id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json<ApiError>({ error: 'データ取得に失敗しました' }, { status: 500 })
    }

    type RequestRow = {
      id: string
      type: string
      target_date: string | null
      reason: string
      note: string | null
      created_at: string
      user_id: string
    }

    const rows = (data ?? []) as unknown as RequestRow[]
    const userIds = [...new Set(rows.map((r) => r.user_id))]

    const { data: users } = await db
      .select('users', 'id, name, employee_code')
      .in('id', userIds)

    type UserRow = { id: string; name: string; employee_code: string }
    const userMap = new Map(((users ?? []) as unknown as UserRow[]).map((u) => [u.id, u]))

    const requests = rows.map((r) => ({
      ...r,
      user: userMap.get(r.user_id) ?? { name: '—', employee_code: '—' },
    }))

    return NextResponse.json({ requests, total: requests.length })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
