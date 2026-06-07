import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError } from '@/lib/types'

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

    const body = await request.json() as Record<string, unknown>
    const allowed = ['label', 'default_amount', 'note', 'sort_order', 'is_active']
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json<ApiError>({ error: '更新項目がありません' }, { status: 400 })
    }

    const { error } = await db.raw
      .from('payslip_templates')
      .update(updates)
      .eq('id', id)
      .eq('company_id', payload.company_id)

    if (error) {
      return NextResponse.json<ApiError>({ error: '更新に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

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
    const db = withCompany(payload.company_id)

    await db.raw
      .from('payslip_templates')
      .update({ is_active: false })
      .eq('id', id)
      .eq('company_id', payload.company_id)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
