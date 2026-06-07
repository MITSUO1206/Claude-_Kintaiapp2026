import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { RequestForm } from '@/components/RequestForm'
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-blue-600 text-lg">KintaiApp</span>
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-xs text-blue-500 hover:underline">ダッシュボード</a>
          <a href="/attendance" className="text-xs text-blue-500 hover:underline">勤怠一覧</a>
          <span className="text-sm text-gray-600">{payload.name}</span>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-xs text-gray-400 hover:text-gray-600">ログアウト</button>
          </form>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4">
        <h1 className="text-xl font-bold mb-4">申請</h1>
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
