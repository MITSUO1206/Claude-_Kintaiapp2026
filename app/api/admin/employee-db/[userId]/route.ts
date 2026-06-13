import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { EmployeeFieldValue, ApiError } from '@/lib/types'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }
    const { userId } = await params
    const body = await request.json() as {
      salary_type: string
      base_salary: number
      values: EmployeeFieldValue[]
    }

    if (body.salary_type !== 'monthly' && body.salary_type !== 'hourly') {
      return NextResponse.json<ApiError>({ error: 'salary_type は monthly または hourly です' }, { status: 400 })
    }
    if (typeof body.base_salary !== 'number' || body.base_salary < 0) {
      return NextResponse.json<ApiError>({ error: 'base_salary は0以上の数値です' }, { status: 400 })
    }

    const db = withCompany(payload.company_id)

    const { data: userCheck } = await db
      .select('users', 'id')
      .eq('id', userId)
      .single()
    if (!userCheck) {
      return NextResponse.json<ApiError>({ error: '社員が見つかりません' }, { status: 404 })
    }

    await db
      .update('users', { salary_type: body.salary_type, base_salary: body.base_salary })
      .eq('id', userId)

    await db.delete('employee_field_values').eq('user_id', userId)

    if (body.values.length > 0) {
      const rows = body.values.map((v) => ({
        user_id: userId,
        field_id: v.field_id ?? null,
        label: v.label,
        category: v.category,
        amount: v.amount,
      }))
      await db.insert('employee_field_values', rows)
    }

    void writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'employee_db_update',
      table_name: 'users',
      record_id: userId,
      new_values: { salary_type: body.salary_type, base_salary: body.base_salary, value_count: body.values.length },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
