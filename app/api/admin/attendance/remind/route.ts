import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }

    const { year, month, user_ids } = await request.json() as { year: number; month: number; user_ids: string[] }
    const db = withCompany(payload.company_id)

    const { data: users } = await db
      .select('users', 'id, name, email')
      .in('id', user_ids)
      .eq('is_active', true)

    type UserRow = { id: string; name: string; email: string | null }
    const targets = ((users ?? []) as unknown as UserRow[]).filter((u) => u.email)

    if (targets.length > 0) {
      const { sendMonthlyReminder } = await import('@/lib/email/resend')
      await Promise.allSettled(
        targets.map((u) =>
          sendMonthlyReminder({ to: u.email!, name: u.name, year, month })
        )
      )
    }

    return NextResponse.json({ sent: targets.length })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
