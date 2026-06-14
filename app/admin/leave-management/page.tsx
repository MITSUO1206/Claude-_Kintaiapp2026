import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AdminSidebar } from '@/components/AdminSidebar'
import { LeaveGrantClient } from '@/components/admin/LeaveGrantClient'

type UserRow = { id: string; employee_code: string; name: string; hired_at: string; role: string }
type BalanceRow = { user_id: string; total_days: number; used_days: number }

function calcGrantDays(hiredAt: string): number {
  const hired = new Date(hiredAt)
  const now = new Date()
  const months = (now.getFullYear() - hired.getFullYear()) * 12 + (now.getMonth() - hired.getMonth())
  if (months < 6)  return 0
  if (months < 18) return 10
  if (months < 30) return 11
  if (months < 42) return 12
  if (months < 54) return 14
  if (months < 66) return 16
  if (months < 78) return 18
  return 20
}

export default async function LeaveManagementPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin' && payload.role !== 'manager') redirect('/dashboard')

  const db = withCompany(payload.company_id)
  const fiscalYear = new Date().getFullYear()

  const [usersRes, balancesRes] = await Promise.all([
    db.select('users', 'id, employee_code, name, hired_at, role')
      .eq('is_active', true)
      .order('employee_code', { ascending: true }),
    db.select('leave_balances', 'user_id, total_days, used_days')
      .eq('fiscal_year', fiscalYear),
  ])

  const users = ((usersRes.data ?? []) as unknown as UserRow[]).filter((u) => u.role !== 'admin')
  const balanceMap = new Map(
    ((balancesRes.data ?? []) as unknown as BalanceRow[]).map((b) => [b.user_id, b])
  )

  const rows = users.map((u) => {
    const bal = balanceMap.get(u.id)
    const totalDays = bal?.total_days ?? calcGrantDays(u.hired_at)
    const usedDays = bal?.used_days ?? 0
    return { ...u, totalDays, usedDays, isAuto: !bal }
  })

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} />

      <main className="flex-1 p-6 max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">有給管理</h1>
        <p className="text-sm text-gray-400 mb-6">{fiscalYear}年度</p>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">社員別有給残日数</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">社員番号</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">氏名</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">付与日数</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">消化日数</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">残日数</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const remaining = u.totalDays - u.usedDays
                  return (
                  <tr key={u.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-500">{u.employee_code}</td>
                    <td className="px-4 py-3 text-sm font-medium">{u.name}</td>
                    <td className="px-4 py-3 text-center text-sm">{u.totalDays}日</td>
                    <td className="px-4 py-3 text-center text-sm text-orange-500">{u.usedDays}日</td>
                    <td className={`px-4 py-3 text-center text-sm font-semibold ${
                      remaining <= 0 ? 'text-red-600' : remaining <= 3 ? 'text-yellow-600' : 'text-green-600'
                    }`}>{remaining}日</td>
                    <td className="px-4 py-3 text-center">
                      <LeaveGrantClient
                        userId={u.id}
                        fiscalYear={fiscalYear}
                        totalDays={u.totalDays}
                        isAuto={u.isAuto}
                      />
                    </td>
                  </tr>
                  )
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      社員が登録されていません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="mt-4 text-xs text-gray-400 space-y-1">
          <p>※ 「自動」と表示されている場合は雇用月数から算出した自動計算値です。「補填」で手動設定できます。</p>
          <p>※ 消化日数は申請承認時に自動で増加します。</p>
        </div>
      </main>
    </div>
  )
}
