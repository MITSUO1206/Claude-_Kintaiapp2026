import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { MonthlyApproval, ApiError } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const { company_id: companyId, user_id: userId } = payload
    const db = withCompany(companyId)

    const body = await request.json()
    const { year, month } = body as { year: number; month: number }

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json<ApiError>({ error: '年月が不正です' }, { status: 400 })
    }

    const { data: existing } = await db
      .select('monthly_approvals', 'id, status')
      .eq('user_id', userId)
      .eq('year', year)
      .eq('month', month)
      .single()

    type ApRow = { id: string; status: string }
    const ex = existing as unknown as ApRow | null

    if (ex?.status === 'submitted' || ex?.status === 'approved') {
      return NextResponse.json<ApiError>(
        { error: 'すでに申請済みです' },
        { status: 409 }
      )
    }

    const submittedAt = new Date().toISOString()
    let approval: MonthlyApproval

    if (ex) {
      const { data, error } = await db
        .update('monthly_approvals', { status: 'submitted', submitted_at: submittedAt })
        .eq('id', ex.id)
        .select()
        .single()
      if (error) return NextResponse.json<ApiError>({ error: '申請に失敗しました' }, { status: 500 })
      approval = data as unknown as MonthlyApproval
    } else {
      const { data, error } = await db.insert('monthly_approvals', {
        user_id: userId,
        year,
        month,
        status: 'submitted',
        submitted_at: submittedAt,
      })
      if (error) return NextResponse.json<ApiError>({ error: '申請に失敗しました' }, { status: 500 })
      const inserted = Array.isArray(data) ? data[0] : data
      approval = inserted as unknown as MonthlyApproval
    }

    void writeAuditLog({
      company_id: companyId,
      user_id:    userId,
      action:     'monthly_approval_submit',
      table_name: 'monthly_approvals',
      record_id:  approval.id,
      new_values: { year, month, status: 'submitted' },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ approval })
  } catch (error) {
    console.error('approval submit error:', error)
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
