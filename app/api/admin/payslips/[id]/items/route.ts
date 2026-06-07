import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError, PayslipItem } from '@/lib/types'

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

    const { data: items } = await db.raw
      .from('payslip_items')
      .select('*')
      .eq('company_id', payload.company_id)
      .eq('payslip_id', id)
      .eq('is_active', true)
      .order('sort_order')

    return NextResponse.json({ items: (items ?? []) as unknown as PayslipItem[] })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(
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

    const { data: ps } = await db.select('payslips', 'id, status').eq('id', id).single()
    if (!ps || (ps as unknown as { status: string }).status === 'published') {
      return NextResponse.json<ApiError>({ error: '公開済みまたは存在しない明細です' }, { status: 400 })
    }

    const body = await request.json() as {
      category: string; label: string; amount: number
      note?: string; sort_order?: number
    }

    if (!['income', 'deduction', 'adjustment'].includes(body.category)) {
      return NextResponse.json<ApiError>({ error: 'categoryが不正です' }, { status: 400 })
    }
    if (!body.label || body.amount === undefined) {
      return NextResponse.json<ApiError>({ error: 'label と amount は必須です' }, { status: 400 })
    }

    const { data: item, error } = await db.raw
      .from('payslip_items')
      .insert({
        company_id: payload.company_id,
        payslip_id: id,
        category: body.category,
        label: body.label,
        amount: body.amount,
        note: body.note ?? null,
        sort_order: body.sort_order ?? 0,
        is_auto_calc: false,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json<ApiError>({ error: '追加に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ item }, { status: 201 })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PUT(
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

    const { data: ps } = await db.select('payslips', 'id, status').eq('id', id).single()
    if (!ps || (ps as unknown as { status: string }).status === 'published') {
      return NextResponse.json<ApiError>({ error: '公開済みまたは存在しない明細です' }, { status: 400 })
    }

    type ItemInput = { id?: string; category: string; label: string; amount: number; note?: string; sort_order?: number; is_auto_calc?: boolean }
    const body = await request.json() as { items: ItemInput[] }

    await db.raw.from('payslip_items')
      .delete()
      .eq('company_id', payload.company_id)
      .eq('payslip_id', id)

    if (body.items.length > 0) {
      const rows = body.items.map((item, i) => ({
        company_id: payload.company_id,
        payslip_id: id,
        category: item.category,
        label: item.label,
        amount: item.amount,
        note: item.note ?? null,
        sort_order: item.sort_order ?? i,
        is_auto_calc: item.is_auto_calc ?? false,
        is_active: true,
      }))
      const { error } = await db.raw.from('payslip_items').insert(rows)
      if (error) {
        return NextResponse.json<ApiError>({ error: '更新に失敗しました' }, { status: 500 })
      }
    }

    const income = body.items.filter((i) => i.category === 'income').reduce((s, i) => s + Number(i.amount), 0)
    const deduction = body.items.filter((i) => i.category === 'deduction').reduce((s, i) => s + Number(i.amount), 0)
    const adjustment = body.items.filter((i) => i.category === 'adjustment').reduce((s, i) => s + Number(i.amount), 0)
    const grossPay = income + adjustment
    const netPay = grossPay - deduction

    await db.update('payslips', {
      gross_pay: grossPay,
      total_deduction: deduction,
      net_pay: netPay,
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    return NextResponse.json({ success: true, gross_pay: grossPay, total_deduction: deduction, net_pay: netPay })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
