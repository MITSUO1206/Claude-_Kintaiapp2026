import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RemindButton } from '@/components/RemindButton'
import { AdminSidebar } from '@/components/AdminSidebar'

function getTodayJST(): string {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return jst.toISOString().split('T')[0]
}

type UserRow = { id: string; employee_code: string; name: string; role: string; email: string | null }
type RecordRow = { user_id: string; clock_in: string | null; clock_out: string | null }
type ClosingRow = { user_id: string; employee_confirmed_at: string | null; closed_at: string | null }

export default async function AdminPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin' && payload.role !== 'manager') redirect('/dashboard')

  const db = withCompany(payload.company_id)
  const today = getTodayJST()
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const [usersRes, todayRes, pendingRes, closingsRes] = await Promise.all([
    db.select('users', 'id, employee_code, name, role, email').eq('is_active', true).order('employee_code', { ascending: true }),
    db.select('attendance_records', 'user_id, clock_in, clock_out').eq('work_date', today),
    db.select('requests', 'id').eq('status', 'pending'),
    db.select('monthly_closings', 'user_id, employee_confirmed_at, closed_at').eq('year', year).eq('month', month),
  ])

  const allUsers = ((usersRes.data ?? []) as unknown as UserRow[]).filter((u) => u.role !== 'admin')
  const recordMap = new Map(((todayRes.data ?? []) as unknown as RecordRow[]).map((r) => [r.user_id, r]))
  const closingMap = new Map(((closingsRes.data ?? []) as unknown as ClosingRow[]).map((c) => [c.user_id, c]))
  const pendingCount = (pendingRes.data ?? []).length

  const statusCounts = { clocked_in: 0, clocked_out: 0, not_clocked: 0 }
  const userList = allUsers.map((u) => {
    const r = recordMap.get(u.id)
    const status = r ? (r.clock_out ? 'clocked_out' : 'clocked_in') : 'not_clocked'
    statusCounts[status]++
    return { ...u, today_status: status, clock_in: r?.clock_in ?? null }
  })

  const unconfirmedUsers = allUsers.filter((u) => {
    const c = closingMap.get(u.id)
    return !c?.employee_confirmed_at && !c?.closed_at
  })

  const [y, m, d] = today.split('-')

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} pendingCount={pendingCount} />

      <main className="flex-1 p-6 space-y-4 max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-800">出退勤状況 — {y}年{m}月{d}日</h1>

        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-gray-500">出勤中</p>
              <p className="text-3xl font-bold text-green-600">{statusCounts.clocked_in}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-gray-500">退勤済み</p>
              <p className="text-3xl font-bold text-gray-600">{statusCounts.clocked_out}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-gray-500">未打刻</p>
              <p className="text-3xl font-bold text-red-500">{statusCounts.not_clocked}</p>
            </CardContent>
          </Card>
        </div>

        {unconfirmedUsers.length > 0 && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-yellow-800 flex items-center justify-between">
                <span>{year}年{month}月 月次確認未申請 — {unconfirmedUsers.length}名</span>
                <RemindButton
                  year={year}
                  month={month}
                  userIds={unconfirmedUsers.map((u) => u.id)}
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-2">
                {unconfirmedUsers.map((u) => (
                  <span key={u.id} className="text-xs bg-yellow-100 border border-yellow-300 text-yellow-800 px-2 py-0.5 rounded">
                    {u.name}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <a
          href="/admin/approvals"
          className="block bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-800">月末締め承認</p>
              <p className="text-xs text-gray-400 mt-0.5">{year}年{month}月の申請一覧を確認する</p>
            </div>
            <span className="text-gray-400">›</span>
          </div>
        </a>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">全社員一覧</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left">社員番号</th>
                  <th className="px-3 py-2 text-left">氏名</th>
                  <th className="px-3 py-2 text-center">ステータス</th>
                  <th className="px-3 py-2 text-center">出勤時刻</th>
                </tr>
              </thead>
              <tbody>
                {userList.map((u) => (
                  <tr key={u.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500">{u.employee_code}</td>
                    <td className="px-3 py-2 font-medium">{u.name}</td>
                    <td className="px-3 py-2 text-center">
                      {u.today_status === 'clocked_in' && <Badge className="bg-green-500 text-white text-xs">出勤中</Badge>}
                      {u.today_status === 'clocked_out' && <Badge variant="secondary" className="text-xs">退勤済</Badge>}
                      {u.today_status === 'not_clocked' && <Badge variant="destructive" className="text-xs">未打刻</Badge>}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-500">
                      {u.clock_in ? new Date(u.clock_in).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
