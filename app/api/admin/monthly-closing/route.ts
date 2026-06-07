import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }

    const body = await request.json() as {
      year: number
      month: number
      user_ids?: string[]
    }
    const { year, month, user_ids } = body

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json<ApiError>({ error: '年月が不正です' }, { status: 400 })
    }

    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
    const targetDate = new Date(year, month - 1, 1)
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    if (targetDate >= currentMonthStart) {
      return NextResponse.json<ApiError>(
        { error: '当月以降は締められません。翌月以降に再試行してください' },
        { status: 400 }
      )
    }

    const db = withCompany(payload.company_id)

    let targetUserIds: string[] = user_ids ?? []
    if (targetUserIds.length === 0) {
      const { data: users } = await db
        .select('users', 'id')
        .eq('is_active', true)
      targetUserIds = ((users ?? []) as unknown as { id: string }[]).map((u) => u.id)
    }

    if (targetUserIds.length === 0) {
      return NextResponse.json<ApiError>({ error: '対象社員が存在しません' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin.rpc('monthly_closing_batch', {
      p_company_id: payload.company_id,
      p_year: year,
      p_month: month,
      p_user_ids: targetUserIds,
      p_closed_by: payload.user_id,
    })

    if (error) {
      console.error('monthly_closing_batch error:', error)
      return NextResponse.json<ApiError>({ error: '締め処理に失敗しました', code: error.code }, { status: 500 })
    }

    await writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'monthly_closing',
      table_name: 'monthly_closings',
      new_values: { year, month, user_count: targetUserIds.length },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ success: true, ...(data as object) })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: '権限がありません' }, { status: 403 })
    }

    const url = new URL(request.url)
    const year = parseInt(url.searchParams.get('year') ?? '0')
    const month = parseInt(url.searchParams.get('month') ?? '0')
    if (!year || !month) {
      return NextResponse.json<ApiError>({ error: '年月を指定してください' }, { status: 400 })
    }

    const db = withCompany(payload.company_id)

    const [{ data: users }, { data: closings }] = await Promise.all([
      db.select('users', 'id, employee_code, name').eq('is_active', true).order('employee_code'),
      db.select('monthly_closings', '*').eq('year', year).eq('month', month),
    ])

    type UserRow = { id: string; employee_code: string; name: string }
    type ClosingRow = { id: string; user_id: string; employee_confirmed_at: string | null; closed_at: string | null }

    const closingMap = new Map(
      ((closings ?? []) as unknown as ClosingRow[]).map((c) => [c.user_id, c])
    )

    const result = ((users ?? []) as unknown as UserRow[]).map((u) => {
      const c = closingMap.get(u.id)
      return {
        user_id: u.id,
        employee_code: u.employee_code,
        name: u.name,
        closing_id: c?.id ?? null,
        employee_confirmed_at: c?.employee_confirmed_at ?? null,
        closed_at: c?.closed_at ?? null,
      }
    })

    return NextResponse.json({ year, month, users: result })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
