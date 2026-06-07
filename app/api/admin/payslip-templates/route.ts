import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError, PayslipTemplate } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: '権限がありません' }, { status: 403 })
    }
    const db = withCompany(payload.company_id)

    const { data: templates } = await db.raw
      .from('payslip_templates')
      .select('*')
      .eq('company_id', payload.company_id)
      .eq('is_active', true)
      .order('sort_order')

    return NextResponse.json({ templates: (templates ?? []) as unknown as PayslipTemplate[] })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }
    const db = withCompany(payload.company_id)

    const body = await request.json() as {
      category: string; label: string; default_amount?: number
      note?: string; sort_order?: number
    }

    if (!['income', 'deduction', 'adjustment'].includes(body.category)) {
      return NextResponse.json<ApiError>({ error: 'categoryが不正です' }, { status: 400 })
    }
    if (!body.label) {
      return NextResponse.json<ApiError>({ error: 'labelは必須です' }, { status: 400 })
    }

    const { data: tmpl, error } = await db.raw
      .from('payslip_templates')
      .insert({
        company_id: payload.company_id,
        category: body.category,
        label: body.label,
        default_amount: body.default_amount ?? null,
        note: body.note ?? null,
        sort_order: body.sort_order ?? 0,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json<ApiError>({ error: '作成に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ template: tmpl }, { status: 201 })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
