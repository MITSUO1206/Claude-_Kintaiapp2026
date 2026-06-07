import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError, Payslip } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const db = withCompany(payload.company_id)

    const url = new URL(request.url)
    const yearParam = url.searchParams.get('year')

    let query = db
      .select('payslips', 'id, year, month, gross_pay, net_pay, total_deduction, work_days, actual_hours, overtime_hours, is_finalized')
      .eq('user_id', payload.user_id)
      .order('year', { ascending: false })

    if (yearParam) {
      query = query.eq('year', parseInt(yearParam))
    }

    const { data, error } = await query.limit(24)
    if (error) {
      return NextResponse.json<ApiError>({ error: 'データ取得に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ payslips: (data ?? []) as unknown as Partial<Payslip>[] })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
