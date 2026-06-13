import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { AdminApprovalsClient } from '@/components/attendance/AdminApprovalsClient'
import type { MonthlyApproval } from '@/lib/types'

export default async function AdminApprovalsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin' && payload.role !== 'manager') redirect('/dashboard')

  const db = withCompany(payload.company_id)
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const year  = now.getFullYear()
  const month = now.getMonth() + 1

  const { data: approvals } = await db
    .select('monthly_approvals')
    .eq('year', year)
    .eq('month', month)
    .order('submitted_at', { ascending: false })

  const rawApprovals = ((approvals ?? []) as unknown as MonthlyApproval[])

  const userIds = [...new Set(rawApprovals.map((a) => a.user_id))]
  const userMap = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: users } = await db.select('users', 'id, name, employee_code').in('id', userIds)
    type UserRow = { id: string; name: string; employee_code: string }
    ;((users ?? []) as unknown as UserRow[]).forEach((u) => {
      userMap.set(u.id, `${u.employee_code} ${u.name}`)
    })
  }

  const approvalsWithName = rawApprovals.map((a) => ({
    ...a,
    user_name: userMap.get(a.user_id) ?? a.user_id,
  }))

  return (
    <AdminApprovalsClient
      initialApprovals={approvalsWithName}
      year={year}
      month={month}
    />
  )
}
