import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError, Payslip } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: '権限がありません' }, { status: 403 })
    }

    const url = new URL(request.url)
    const year  = parseInt(url.searchParams.get('year')  ?? String(new Date().getFullYear()))
    const month = parseInt(url.searchParams.get('month') ?? String(new Date().getMonth() + 1))

    const db = withCompany(payload.company_id)

    const { data: payslips, error } = await db
      .select('payslips', '*')
      .eq('year', year)
      .eq('month', month)
      .order('user_id')

    if (error) {
      return NextResponse.json<ApiError>({ error: 'データ取得に失敗しました' }, { status: 500 })
    }

    const rows = (payslips ?? []) as unknown as Payslip[]
    const userIds = rows.map((r) => r.user_id)

    const { data: users } = userIds.length > 0
      ? await db.select('users', 'id, name, employee_code, salary_type').in('id', userIds)
      : { data: [] }

    type UserRow = { id: string; name: string; employee_code: string; salary_type: string }
    const userMap = new Map(((users ?? []) as unknown as UserRow[]).map((u) => [u.id, u]))

    const result = rows.map((p) => ({
      ...p,
      user: userMap.get(p.user_id) ?? { name: '—', employee_code: '—', salary_type: '—' },
    }))

    return NextResponse.json({ payslips: result, year, month })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
