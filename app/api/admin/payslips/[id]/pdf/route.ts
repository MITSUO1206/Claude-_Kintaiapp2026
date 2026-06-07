import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { PayslipDocument } from '@/components/PayslipDocument'
import type { ApiError, Payslip } from '@/lib/types'

export const runtime = 'nodejs'

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

    const { data: user } = await db
      .select('users', 'name, employee_code')
      .eq('id', p.user_id)
      .single()

    type UserRow = { name: string; employee_code: string }
    const u = (user as unknown as UserRow | null) ?? { name: '—', employee_code: '—' }

    const { data: company } = await db.raw
      .from('companies')
      .select('name')
      .eq('id', payload.company_id)
      .single()

    const companyName = (company as { name: string } | null)?.name ?? ''

    const buffer = await renderToBuffer(
      PayslipDocument({ payslip: p, userName: u.name, employeeCode: u.employee_code, companyName })
    )

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="payslip_${p.year}${String(p.month).padStart(2,'0')}_${u.employee_code}.pdf"`,
      },
    })
  } catch (err) {
    console.error('pdf generate error:', err)
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
