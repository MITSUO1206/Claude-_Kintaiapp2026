import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { RequestForm } from '@/components/RequestForm'
import { EmployeeSidebar } from '@/components/EmployeeSidebar'
import type { Request, LeaveBalance } from '@/lib/types'

export default async function RequestsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')

  const db = withCompany(payload.company_id)
  const fiscalYear = new Date().getFullYear()

  const [{ data: requestsData }, { data: balanceData }] = await Promise.all([
    db
      .select('requests', 'id, type, target_date, reason, status, rejection_reason, created_at')
      .eq('user_id', payload.user_id)
      .order('created_at', { ascending: false })
      .limit(50),
    db
      .select('leave_balances', 'total_days, used_days')
      .eq('user_id', payload.user_id)
      .eq('fiscal_year', fiscalYear)
      .single(),
  ])

  const requests = (requestsData ?? []) as unknown as Request[]
  const bal = balanceData as unknown as { total_days: number; used_days: number } | null

  const leaveBalance = bal
    ? { total_days: bal.total_days, used_days: bal.used_days, remaining_days: bal.total_days - bal.used_days }
    : null

  return (
    <div className="flex min-h-screen bg-gray-50">
      <EmployeeSidebar userName={payload.name} />

      <main className="flex-1 p-6 max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">申請</h1>
        <RequestForm
          initialRequests={requests.map((r) => ({
            id: r.id,
            type: r.type,
            target_date: r.target_date,
            reason: r.reason,
            status: r.status,
            rejection_reason: r.rejection_reason,
            created_at: r.created_at,
          }))}
          leaveBalance={leaveBalance}
        />
      </main>
    </div>
  )
}
