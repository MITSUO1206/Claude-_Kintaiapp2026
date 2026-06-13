import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { AdminSidebar } from '@/components/AdminSidebar'
import { EmployeeDbClient } from '@/components/admin/EmployeeDbClient'
import type { EmployeeDbRow, EmployeeFieldDef, EmployeeFieldValue } from '@/lib/types'

type UserRow = {
  id: string; employee_code: string; name: string
  salary_type: string; base_salary: number; is_active: boolean
}
type ValueRow = {
  id: string; user_id: string; field_id: string | null
  label: string; category: string; amount: number
}

export default async function EmployeeDbPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin' && payload.role !== 'manager') redirect('/dashboard')

  const db = withCompany(payload.company_id)

  const [usersRes, defsRes, valuesRes] = await Promise.all([
    db.select('users', 'id, employee_code, name, salary_type, base_salary, is_active')
      .order('employee_code'),
    db.select('employee_field_defs', 'id, company_id, label, category, sort_order, is_active, created_at')
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

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <EmployeeDbClient initialEmployees={employees} initialFields={fields} />
      </div>
    </div>
  )
}
