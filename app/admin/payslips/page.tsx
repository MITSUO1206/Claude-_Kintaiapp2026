import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import type { Payslip } from '@/lib/types'
import { AdminSidebar } from '@/components/AdminSidebar'
import { PayslipsClient } from '@/components/admin/PayslipsClient'

type SearchParams = Promise<{ year?: string; month?: string; user_id?: string; status?: string }>
type UserRow = { id: string; name: string; employee_code: string }

export default async function AdminPayslipsPage({ searchParams }: { searchParams: SearchParams }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin' && payload.role !== 'manager') redirect('/dashboard')

  const sp = await searchParams
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const year   = sp.year   ? parseInt(sp.year)   : now.getFullYear()
  const month  = sp.month  ? parseInt(sp.month)  : now.getMonth() + 1
  const filterUserId = sp.user_id ?? ''
  const filterStatus = sp.status  ?? ''

  const db = withCompany(payload.company_id)

  const [payslipsRes, allUsersRes] = await Promise.all([
    db.select('payslips', '*').eq('year', year).eq('month', month).order('user_id'),
    db.select('users', 'id, name, employee_code').eq('is_active', true).order('employee_code', { ascending: true }),
  ])

  const allUsers = ((allUsersRes.data ?? []) as unknown as UserRow[])
  let rows = (payslipsRes.data ?? []) as unknown as (Payslip & { status: string })[]

  if (filterUserId) rows = rows.filter((r) => r.user_id === filterUserId)
  if (filterStatus) rows = rows.filter((r) => r.status === filterStatus)

  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const { data: usersForRows } = userIds.length > 0
    ? await db.select('users', 'id, name, employee_code').in('id', userIds)
    : { data: [] }
  const userMapArr = (usersForRows ?? []) as unknown as UserRow[]
  const userMapRecord: Record<string, UserRow> = {}
  for (const u of userMapArr) userMapRecord[u.id] = u

  const prevYear  = month === 1  ? year - 1 : year
  const prevMonth = month === 1  ? 12 : month - 1
  const nextYear  = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1  : month + 1

  const totalGross = rows.reduce((s, r) => s + r.gross_pay, 0)
  const totalNet   = rows.reduce((s, r) => s + r.net_pay,   0)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} />
      <PayslipsClient
        rows={rows}
        userMap={userMapRecord}
        year={year}
        month={month}
        prevYear={prevYear}
        prevMonth={prevMonth}
        nextYear={nextYear}
        nextMonth={nextMonth}
        totalGross={totalGross}
        totalNet={totalNet}
        filterUserId={filterUserId}
        filterStatus={filterStatus}
        allUsers={allUsers}
      />
    </div>
  )
}
