import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError, Payslip } from '@/lib/types'

export async function GET(
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

    const { data: payslip } = await db.select('payslips', '*').eq('id', id).single()
    const p = payslip as unknown as Payslip | null
    if (!p) {
      return NextResponse.json<ApiError>({ error: '給与明細が見つかりません' }, { status: 404 })
    }

    const { data: items } = await db.raw
      .from('payslip_items')
      .select('*')
      .eq('company_id', payload.company_id)
      .eq('payslip_id', id)
      .eq('is_active', true)
      .order('sort_order')

    return NextResponse.json({ payslip: p, items: items ?? [] })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

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

    const { data: existing } = await db.select('payslips', 'id, status').eq('id', id).single()
    const ex = existing as unknown as { id: string; status: string } | null
    if (!ex) {
      return NextResponse.json<ApiError>({ error: '給与明細が見つかりません' }, { status: 404 })
    }
    if (ex.status === 'published') {
      return NextResponse.json<ApiError>({ error: '公開済みの明細は編集できません' }, { status: 400 })
    }

    const body = await request.json() as Record<string, unknown>
    const allowed = ['gross_pay', 'total_deduction', 'net_pay']
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    const { error } = await db.update('payslips', updates).eq('id', id)
    if (error) {
      return NextResponse.json<ApiError>({ error: '更新に失敗しました' }, { status: 500 })
    }

    await writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'payslip_edit',
      table_name: 'payslips',
      record_id: id,
      new_values: updates,
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

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

    const { data: existing } = await db.select('payslips', 'id, status').eq('id', id).single()
    const ex = existing as unknown as { id: string; status: string } | null
    if (!ex) {
      return NextResponse.json<ApiError>({ error: '給与明細が見つかりません' }, { status: 404 })
    }
    if (ex.status === 'published') {
      return NextResponse.json<ApiError>({ error: '公開済みの明細は削除できません' }, { status: 400 })
    }

    const { error } = await db.raw.from('payslips').delete()
      .eq('id', id)
      .eq('company_id', payload.company_id)
    if (error) {
      return NextResponse.json<ApiError>({ error: '削除に失敗しました' }, { status: 500 })
    }

    await writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'payslip_delete',
      table_name: 'payslips',
      record_id: id,
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
