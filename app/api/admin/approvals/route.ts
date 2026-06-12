import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { MonthlyApproval, ApiError } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }

    const db = withCompany(payload.company_id)
    const url = new URL(request.url)
    const yearParam  = url.searchParams.get('year')
    const monthParam = url.searchParams.get('month')
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    const year  = yearParam  ? parseInt(yearParam)  : now.getFullYear()
    const month = monthParam ? parseInt(monthParam) : now.getMonth() + 1

    const { data, error } = await db
      .select('monthly_approvals')
      .eq('year', year)
      .eq('month', month)
      .order('submitted_at', { ascending: false })

    if (error) {
      return NextResponse.json<ApiError>({ error: 'データ取得に失敗しました' }, { status: 500 })
    }

    const approvals = (data ?? []) as unknown as MonthlyApproval[]

    const userIds = [...new Set(approvals.map((a) => a.user_id))]
    const userMap = new Map<string, string>()
    if (userIds.length > 0) {
      const { data: users } = await db
        .select('users', 'id, name, employee_code')
        .in('id', userIds)
      type UserRow = { id: string; name: string; employee_code: string }
      ;((users ?? []) as unknown as UserRow[]).forEach((u) => {
        userMap.set(u.id, `${u.employee_code} ${u.name}`)
      })
    }

    const result = approvals.map((a) => ({
      ...a,
      user_name: userMap.get(a.user_id) ?? a.user_id,
    }))

    return NextResponse.json({ approvals: result, year, month })
  } catch (error) {
    console.error('admin approvals GET error:', error)
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
