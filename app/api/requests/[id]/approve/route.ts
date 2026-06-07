import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { sendApprovalResult } from '@/lib/email/resend'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError } from '@/lib/types'

function calcGrantDays(hiredAt: string): number {
  const hired = new Date(hiredAt)
  const now = new Date()
  const monthsDiff =
    (now.getFullYear() - hired.getFullYear()) * 12 + (now.getMonth() - hired.getMonth())
  if (monthsDiff < 6) return 0
  if (monthsDiff < 18) return 10
  if (monthsDiff < 30) return 11
  if (monthsDiff < 42) return 12
  if (monthsDiff < 54) return 14
  if (monthsDiff < 66) return 16
  if (monthsDiff < 78) return 18
  return 20
}

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
    const db = withCompany(payload.company_id)

    const { data: existing } = await db
      .select('requests', 'id, status, type, user_id, target_date')
      .eq('id', id)
      .single()

    type ReqRow = { id: string; status: string; type: string; user_id: string; target_date: string | null }
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

    const now = new Date().toISOString()
    const { error } = await db
      .update('requests', {
        status: 'approved',
        approver_id: payload.user_id,
        approved_at: now,
      })
      .eq('id', id)

    if (error) {
      return NextResponse.json<ApiError>({ error: '承認に失敗しました' }, { status: 500 })
    }

    // 有給申請承認 → leave_balances.used_days +1（レコード未存在なら自動付与して作成）
    if ((req.type === 'leave_paid' || req.type === 'leave_special') && req.target_date) {
      const fiscalYear = new Date(req.target_date).getFullYear()
      const { data: balance } = await db
        .select('leave_balances', 'id, used_days')
        .eq('user_id', req.user_id)
        .eq('fiscal_year', fiscalYear)
        .single()

      type BalRow = { id: string; used_days: number }
      const bal = balance as unknown as BalRow | null

      if (bal) {
        await db
          .update('leave_balances', { used_days: bal.used_days + 1 })
          .eq('id', bal.id)
      } else {
        const { data: targetUser } = await db
          .select('users', 'hired_at')
          .eq('id', req.user_id)
          .single()
        const hiredAt = (targetUser as unknown as { hired_at: string } | null)?.hired_at ?? ''
        const totalDays = calcGrantDays(hiredAt)
        await db.insert('leave_balances', {
          user_id: req.user_id,
          fiscal_year: fiscalYear,
          total_days: totalDays,
          used_days: 1,
        })
      }
    }

    // 申請者情報取得してメール通知
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
        status: 'approved',
      }).catch(() => undefined)
    }

    await writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'request_approve',
      table_name: 'requests',
      record_id: id,
      new_values: { status: 'approved', approver_id: payload.user_id },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
