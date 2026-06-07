import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError } from '@/lib/types'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json() as { reason?: string }
    if (!body.reason?.trim()) {
      return NextResponse.json<ApiError>({ error: 'ロック解除理由は必須です' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin.rpc('monthly_closing_unlock', {
      p_company_id: payload.company_id,
      p_closing_id: id,
    })

    if (error) {
      if (error.message?.includes('closing_not_found')) {
        return NextResponse.json<ApiError>({ error: '締めレコードが見つかりません' }, { status: 404 })
      }
      console.error('monthly_closing_unlock error:', error)
      return NextResponse.json<ApiError>({ error: 'ロック解除に失敗しました' }, { status: 500 })
    }

    await writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'monthly_closing_unlock',
      table_name: 'monthly_closings',
      record_id: id,
      new_values: { reason: body.reason },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ success: true, ...(data as object) })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
