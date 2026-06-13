import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { EmployeeFieldDef, ApiError } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }
    const db = withCompany(payload.company_id)
    const { data, error } = await db
      .select('employee_field_defs', 'id, label, category, sort_order, is_active, created_at')
      .eq('is_active', true)
      .order('sort_order')
    if (error) return NextResponse.json<ApiError>({ error: 'DB error' }, { status: 500 })
    return NextResponse.json({ fields: (data ?? []) as unknown as EmployeeFieldDef[] })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await request.json() as { label: string; category: string }
    if (!body.label?.trim()) {
      return NextResponse.json<ApiError>({ error: 'label は必須です' }, { status: 400 })
    }
    if (body.category !== 'allowance' && body.category !== 'deduction') {
      return NextResponse.json<ApiError>({ error: 'category は allowance または deduction です' }, { status: 400 })
    }
    const db = withCompany(payload.company_id)
    const { data: existing } = await db
      .select('employee_field_defs', 'sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: false })
      .limit(1)
    const maxOrder = ((existing ?? []) as unknown as { sort_order: number }[])[0]?.sort_order ?? -1
    const { data, error } = await db.insert('employee_field_defs', {
      label: body.label.trim(),
      category: body.category,
      sort_order: maxOrder + 1,
    })
    if (error) return NextResponse.json<ApiError>({ error: 'DB error' }, { status: 500 })
    const field = (data as unknown as EmployeeFieldDef[])[0]
    void writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'employee_field_def_create',
      table_name: 'employee_field_defs',
      record_id: field.id,
      new_values: { label: field.label, category: field.category },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })
    return NextResponse.json({ field }, { status: 201 })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
