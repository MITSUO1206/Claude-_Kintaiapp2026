import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { AdminSidebar } from '@/components/AdminSidebar'
import { EmployeeDbClient } from '@/components/admin/EmployeeDbClient'
import type { EmployeeDbRow, EmployeeFieldDef, EmployeeFieldValue } from '@/lib/types'

type UserRow = {
  id: string; employee_code: string; name: string
  salary_type: string; base_salary: number; is_active: boolean
}
type MonthlyValueRow = {
  user_id: string; field_id: string | null
  label: string; category: string; amount: number
}

type SearchParams = Promise<{ year?: string; month?: string }>

export default async function EmployeeDbPage({ searchParams }: { searchParams: SearchParams }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin' && payload.role !== 'manager') redirect('/dashboard')

  const sp = await searchParams
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const initialYear  = sp.year  ? parseInt(sp.year)  : now.getFullYear()
  const initialMonth = sp.month ? parseInt(sp.month) : now.getMonth() + 1

  const db = withCompany(payload.company_id)

  const [usersRes, defsRes, monthlyValuesRes, workRuleRes] = await Promise.all([
    db.select('users', 'id, employee_code, name, salary_type, base_salary, is_active')
      .order('employee_code'),
    db.select('employee_field_defs', 'id, company_id, label, category, sort_order, is_active, created_at')
      .eq('is_active', true)
      .order('sort_order'),
    // 月別データ（デフォルト白紙）
    supabaseAdmin
      .from('monthly_salary_values')
      .select('user_id, field_id, label, category, amount')
      .eq('company_id', payload.company_id)
      .eq('year', initialYear)
      .eq('month', initialMonth),
    db.select('work_rules', 'work_days_per_month').limit(1).single(),
  ])

  const users       = (usersRes.data       ?? []) as unknown as UserRow[]
  const fields      = (defsRes.data        ?? []) as unknown as EmployeeFieldDef[]
  const monthlyRows = (monthlyValuesRes.data ?? []) as unknown as MonthlyValueRow[]
  const workDaysPerMonth = (workRuleRes.data as unknown as { work_days_per_month: number } | null)?.work_days_per_month ?? 20

  const monthlyByUser = new Map<string, EmployeeFieldValue[]>()
  for (const v of monthlyRows) {
    const list = monthlyByUser.get(v.user_id) ?? []
    list.push({
      field_id: v.field_id,
      label:    v.label,
      category: v.category as 'allowance' | 'deduction',
      amount:   Number(v.amount),
    })
    monthlyByUser.set(v.user_id, list)
  }

  const employees: EmployeeDbRow[] = users.map((u) => ({
    id:            u.id,
    employee_code: u.employee_code,
    name:          u.name,
    salary_type:   u.salary_type as 'monthly' | 'hourly',
    base_salary:   Number(u.base_salary ?? 0),
    is_active:     u.is_active,
    values:        monthlyByUser.get(u.id) ?? [], // 月別（デフォルト空）
  }))

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <EmployeeDbClient
          initialEmployees={employees}
          initialFields={fields}
          initialYear={initialYear}
          initialMonth={initialMonth}
          workDaysPerMonth={workDaysPerMonth}
        />
      </div>
    </div>
  )
}
