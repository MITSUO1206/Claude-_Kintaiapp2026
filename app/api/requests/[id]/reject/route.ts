import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { sendApprovalResult } from '@/lib/email/resend'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError } from '@/lib/types'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: '権限がありません' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json() as { rejection_reason?: string }

    if (!body.rejection_reason?.trim()) {
      return NextResponse.json<ApiError>({ error: '却下理由は必須です' }, { status: 400 })
    }

    const db = withCompany(payload.company_id)

    const { data: existing } = await db
      .select('requests', 'id, status, type, user_id')
      .eq('id', id)
      .single()

    type ReqRow = { id: string; status: string; type: string; user_id: string }
    const req = existing as unknown as ReqRow | null

    if (!req) {
      return NextResponse.json<ApiError>({ error: '申請が見つかりません' }, { status: 404 })
    }
    if (req.status !== 'pending') {
      return NextResponse.json<ApiError>(
        { error: 'すでに処理済みの申請です', code: 'ALREADY_PROCESSED' },
        { status: 409 }
      )
    }

    const { error } = await db
      .update('requests', {
        status: 'rejected',
        approver_id: payload.user_id,
        approved_at: new Date().toISOString(),
        rejection_reason: body.rejection_reason.trim(),
      })
      .eq('id', id)

    if (error) {
      return NextResponse.json<ApiError>({ error: '却下処理に失敗しました' }, { status: 500 })
    }

    const { data: applicant } = await db
      .select('users', 'email, name')
      .eq('id', req.user_id)
      .single()

    type UserRow = { email: string; name: string }
    const user = applicant as unknown as UserRow | null

    if (user?.email) {
      sendApprovalResult({
        to: user.email,
        applicantName: user.name,
        requestType: req.type,
        status: 'rejected',
        rejectionReason: body.rejection_reason,
      }).catch(() => undefined)
    }

    await writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'request_reject',
      table_name: 'requests',
      record_id: id,
      new_values: { status: 'rejected', rejection_reason: body.rejection_reason },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
