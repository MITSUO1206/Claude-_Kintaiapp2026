import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError, LeaveBalance } from '@/lib/types'

function calcGrantDays(hiredAt: string): number {
  const hired = new Date(hiredAt)
  const now = new Date()
  const monthsDiff =
    (now.getFullYear() - hired.getFullYear()) * 12 + (now.getMonth() - hired.getMonth())

  if (monthsDiff < 6) return 0
  if (monthsDiff < 18) return 10
  if (monthsDiff < 30) return 11
  if (monthsDiff < 42) return 12
  if (monthsDiff < 54) return 14
  if (monthsDiff < 66) return 16
  if (monthsDiff < 78) return 18
  return 20
}

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const db = withCompany(payload.company_id)

    const url = new URL(request.url)
    const yearParam = url.searchParams.get('year')
    const fiscalYear = yearParam
      ? parseInt(yearParam)
      : new Date().getFullYear()

    const { data: balance } = await db
      .select('leave_balances', '*')
      .eq('user_id', payload.user_id)
      .eq('fiscal_year', fiscalYear)
      .single()

    const typed = balance as unknown as LeaveBalance | null

    if (!typed) {
      const { data: user } = await db
        .select('users', 'hired_at')
        .eq('id', payload.user_id)
        .single()

      const hiredAt = (user as unknown as { hired_at: string } | null)?.hired_at ?? ''
      const grantDays = calcGrantDays(hiredAt)

      return NextResponse.json({
        fiscal_year: fiscalYear,
        total_days: grantDays,
        used_days: 0,
        remaining_days: grantDays,
        note: '未作成（自動計算値）',
      })
    }

    return NextResponse.json({
      fiscal_year: typed.fiscal_year,
      total_days: typed.total_days,
      used_days: typed.used_days,
      remaining_days: typed.total_days - typed.used_days,
    })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
