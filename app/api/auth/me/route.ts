import { NextRequest, NextResponse } from 'next/server'
import { withCompany, getCompanyId, getUserId } from '@/lib/db/withCompany'
import type { ApiError } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const companyId = getCompanyId(request)
    const userId = getUserId(request)
    const db = withCompany(companyId)

    const { data: user, error } = await db
      .select('users', 'id, employee_code, name, role, force_password_change')
      .eq('id', userId)
      .single()

    if (error || !user) {
      return NextResponse.json<ApiError>({ error: 'ユーザーが見つかりません' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
