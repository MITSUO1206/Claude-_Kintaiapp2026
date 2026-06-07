import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }

    const body = await request.json() as {
      user_id: string
      fiscal_year: number
      total_days: number
    }

    if (!body.user_id || !body.fiscal_year || body.total_days == null) {
      return NextResponse.json<ApiError>({ error: 'パラメータが不足しています' }, { status: 400 })
    }

    const db = withCompany(payload.company_id)

    const { data: existing } = await db
      .select('leave_balances', 'id, total_days')
      .eq('user_id', body.user_id)
      .eq('fiscal_year', body.fiscal_year)
      .single()

    type BalRow = { id: string; total_days: number }
    const bal = existing as unknown as BalRow | null

    if (bal) {
      const { error } = await db
        .update('leave_balances', { total_days: body.total_days })
        .eq('id', bal.id)

      if (error) {
        return NextResponse.json<ApiError>({ error: '更新に失敗しました' }, { status: 500 })
      }

      await writeAuditLog({
        company_id: payload.company_id,
        user_id: payload.user_id,
        action: 'leave_balance_update',
        table_name: 'leave_balances',
        record_id: bal.id,
        old_values: { total_days: bal.total_days },
        new_values: { total_days: body.total_days },
      })
    } else {
      const { error } = await db.insert('leave_balances', {
        user_id: body.user_id,
        fiscal_year: body.fiscal_year,
        total_days: body.total_days,
        used_days: 0,
      })

      if (error) {
        return NextResponse.json<ApiError>({ error: '作成に失敗しました' }, { status: 500 })
      }

      await writeAuditLog({
        company_id: payload.company_id,
        user_id: payload.user_id,
        action: 'leave_balance_grant',
        table_name: 'leave_balances',
        new_values: { user_id: body.user_id, fiscal_year: body.fiscal_year, total_days: body.total_days },
      })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
