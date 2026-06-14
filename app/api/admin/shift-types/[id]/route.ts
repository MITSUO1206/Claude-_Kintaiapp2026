import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError } from '@/lib/types'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }
    const { id } = await params
    const db = withCompany(payload.company_id)

    const { error } = await db
      .update('shift_types', { is_active: false })
      .eq('id', id)

    if (error) {
      return NextResponse.json<ApiError>({ error: '削除に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
