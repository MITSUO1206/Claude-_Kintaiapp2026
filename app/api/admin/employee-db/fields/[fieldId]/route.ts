import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError } from '@/lib/types'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ fieldId: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }
    const { fieldId } = await params
    const db = withCompany(payload.company_id)
    const { error } = await db
      .update('employee_field_defs', { is_active: false })
      .eq('id', fieldId)
    if (error) return NextResponse.json<ApiError>({ error: 'DB error' }, { status: 500 })
    void writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'employee_field_def_delete',
      table_name: 'employee_field_defs',
      record_id: fieldId,
      new_values: { is_active: false },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
