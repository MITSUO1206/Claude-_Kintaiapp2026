import { NextRequest, NextResponse } from 'next/server'
import { withCompany, getCompanyId, getUserId } from '@/lib/db/withCompany'
import type { ApiError } from '@/lib/types'

function getTodayJST(): string {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return jst.toISOString().split('T')[0]
}

export async function GET(request: NextRequest) {
  try {
    const companyId = getCompanyId(request)
    const userId = getUserId(request)
    const db = withCompany(companyId)

    const { data: record } = await db
      .select('attendance_records')
      .eq('user_id', userId)
      .eq('work_date', getTodayJST())
      .single()

    return NextResponse.json({ record: record ?? null })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
