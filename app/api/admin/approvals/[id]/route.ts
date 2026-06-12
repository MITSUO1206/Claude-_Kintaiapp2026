import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { MonthlyApproval, ApiError } from '@/lib/types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const db = withCompany(payload.company_id)

    const body = await request.json()
    const { action } = body as { action: 'approve' | 'reject' }

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json<ApiError>({ error: 'action は approve または reject です' }, { status: 400 })
    }

    const { data: existing } = await db
      .select('monthly_approvals', 'id, status, user_id, year, month')
      .eq('id', id)
      .single()

    type ApRow = { id: string; status: string; user_id: string; year: number; month: number }
    const ex = existing as unknown as ApRow | null

    if (!ex) {
      return NextResponse.json<ApiError>({ error: '申請が見つかりません' }, { status: 404 })
    }
    if (ex.status !== 'submitted') {
      return NextResponse.json<ApiError>({ error: '申請済み状態の申請のみ操作できます' }, { status: 409 })
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected'
    const now = new Date().toISOString()

    const { data, error } = await db
      .update('monthly_approvals', {
        status:      newStatus,
        approved_at: action === 'approve' ? now : null,
        approved_by: payload.user_id,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json<ApiError>({ error: '操作に失敗しました' }, { status: 500 })
    }

    const approval = data as unknown as MonthlyApproval

    void writeAuditLog({
      company_id: payload.company_id,
      user_id:    payload.user_id,
      action:     `monthly_approval_${newStatus}`,
      table_name: 'monthly_approvals',
      record_id:  id,
      new_values: { status: newStatus, target_user_id: ex.user_id, year: ex.year, month: ex.month },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ approval })
  } catch (error) {
    console.error('admin approval action error:', error)
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
