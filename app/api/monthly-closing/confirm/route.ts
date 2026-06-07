import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const db = withCompany(payload.company_id)

    const body = await request.json() as { year: number; month: number }
    const { year, month } = body

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json<ApiError>({ error: '年月が不正です' }, { status: 400 })
    }

    const { data: existing } = await db
      .select('monthly_closings', 'id, employee_confirmed_at, closed_at')
      .eq('user_id', payload.user_id)
      .eq('year', year)
      .eq('month', month)
      .single()

    type ClosingRow = { id: string; employee_confirmed_at: string | null; closed_at: string | null }
    const closing = existing as unknown as ClosingRow | null

    if (!closing) {
      return NextResponse.json<ApiError>(
        { error: 'まだ月次締めが開始されていません' },
        { status: 404 }
      )
    }

    if (closing.employee_confirmed_at) {
      return NextResponse.json(
        { message: 'すでに確定申請済みです', employee_confirmed_at: closing.employee_confirmed_at },
        { status: 200 }
      )
    }

    const { error } = await db
      .update('monthly_closings', { employee_confirmed_at: new Date().toISOString() })
      .eq('id', closing.id)

    if (error) {
      return NextResponse.json<ApiError>({ error: '確定申請に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
