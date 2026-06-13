import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { MonthlyApproval, ApiError } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const db = withCompany(payload.company_id)

    const url = new URL(request.url)
    const year  = parseInt(url.searchParams.get('year')  ?? '0')
    const month = parseInt(url.searchParams.get('month') ?? '0')

    if (!year || !month) {
      return NextResponse.json<ApiError>({ error: '年月が必要です' }, { status: 400 })
    }

    const { data } = await db
      .select('monthly_approvals')
      .eq('user_id', payload.user_id)
      .eq('year', year)
      .eq('month', month)
      .single()

    return NextResponse.json({ approval: (data as unknown as MonthlyApproval | null) })
  } catch (error) {
    console.error('approvals GET error:', error)
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
