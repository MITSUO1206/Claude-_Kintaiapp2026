import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { EmployeeFieldDef, EmployeeFieldValue, EmployeeDbRow, ApiError } from '@/lib/types'

type UserRow = {
  id: string; employee_code: string; name: string
  salary_type: string; base_salary: number; is_active: boolean
}
type ValueRow = {
  id: string; user_id: string; field_id: string | null
  label: string; category: string; amount: number
}

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }
    const db = withCompany(payload.company_id)

    const [usersRes, defsRes, valuesRes] = await Promise.all([
      db.select('users', 'id, employee_code, name, salary_type, base_salary, is_active')
        .order('employee_code'),
      db.select('employee_field_defs', 'id, label, category, sort_order, is_active, created_at')
        .eq('is_active', true)
        .order('sort_order'),
      db.select('employee_field_values', 'id, user_id, field_id, label, category, amount'),
    ])

    const users = (usersRes.data ?? []) as unknown as UserRow[]
    const fields = (defsRes.data ?? []) as unknown as EmployeeFieldDef[]
    const allValues = (valuesRes.data ?? []) as unknown as ValueRow[]

    const valuesByUser = new Map<string, EmployeeFieldValue[]>()
    for (const v of allValues) {
      const list = valuesByUser.get(v.user_id) ?? []
      list.push({
        id: v.id,
        field_id: v.field_id,
        label: v.label,
        category: v.category as 'allowance' | 'deduction',
        amount: Number(v.amount),
      })
      valuesByUser.set(v.user_id, list)
    }

    const employees: EmployeeDbRow[] = users.map((u) => ({
      id: u.id,
      employee_code: u.employee_code,
      name: u.name,
      salary_type: u.salary_type as 'monthly' | 'hourly',
      base_salary: Number(u.base_salary ?? 0),
      is_active: u.is_active,
      values: valuesByUser.get(u.id) ?? [],
    }))

    return NextResponse.json({ fields, employees })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
