import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError, Payslip } from '@/lib/types'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }
    const { id } = await params
    const db = withCompany(payload.company_id)

    const { data: existing } = await db.select('payslips', 'id, status, user_id, year, month').eq('id', id).single()
    const ex = existing as unknown as Pick<Payslip, 'id' | 'status' | 'user_id' | 'year' | 'month'> | null
    if (!ex) {
      return NextResponse.json<ApiError>({ error: '給与明細が見つかりません' }, { status: 404 })
    }
    if (ex.status === 'published') {
      return NextResponse.json<ApiError>({ error: 'すでに公開済みです' }, { status: 409 })
    }

    const publishedAt = new Date().toISOString()
    const { error } = await db.update('payslips', {
      status: 'published',
      published_at: publishedAt,
      is_finalized: true,
      updated_at: publishedAt,
    }).eq('id', id)

    if (error) {
      return NextResponse.json<ApiError>({ error: '公開に失敗しました' }, { status: 500 })
    }

    // メール通知（社員のメールアドレスを取得）
    try {
      const { data: user } = await db
        .select('users', 'email, name')
        .eq('id', ex.user_id)
        .single()
      type UserRow = { email: string | null; name: string }
      const u = user as unknown as UserRow | null
      if (u?.email) {
        const { sendPayslipPublished } = await import('@/lib/email/resend')
        await sendPayslipPublished({
          to: u.email,
          name: u.name,
          year: ex.year,
          month: ex.month,
        })
      }
    } catch {
      // メール失敗はサイレント
    }

    await writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'payslip_publish',
      table_name: 'payslips',
      record_id: id,
      new_values: { year: ex.year, month: ex.month, target_user_id: ex.user_id },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
