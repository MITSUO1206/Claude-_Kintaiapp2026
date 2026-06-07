import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError, Payslip, PayslipItem } from '@/lib/types'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireAuth(request)
    const { id } = await params
    const db = withCompany(payload.company_id)

    const { data: payslip } = await db
      .select('payslips', '*')
      .eq('id', id)
      .single()

    const p = payslip as unknown as Payslip | null
    if (!p) {
      return NextResponse.json<ApiError>({ error: '給与明細が見つかりません' }, { status: 404 })
    }

    if (payload.role === 'employee' && p.user_id !== payload.user_id) {
      return NextResponse.json<ApiError>({ error: 'アクセス権限がありません' }, { status: 403 })
    }
    if (payload.role === 'employee' && p.status !== 'published') {
      return NextResponse.json<ApiError>({ error: '給与明細が見つかりません' }, { status: 404 })
    }

    const { data: items } = await db.raw
      .from('payslip_items')
      .select('*')
      .eq('company_id', payload.company_id)
      .eq('payslip_id', id)
      .eq('is_active', true)
      .order('sort_order')

    return NextResponse.json({ payslip: p, items: (items ?? []) as unknown as PayslipItem[] })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
