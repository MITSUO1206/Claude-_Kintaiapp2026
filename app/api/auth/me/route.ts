import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const db = withCompany(payload.company_id)

    const { data: user, error } = await db
      .select('users', 'id, employee_code, name, role, force_password_change')
      .eq('id', payload.user_id)
      .single()

    if (error || !user) {
      return NextResponse.json<ApiError>({ error: 'ユーザーが見つかりません' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
