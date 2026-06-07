import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function getTodayJST(): string {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return jst.toISOString().split('T')[0]
}

type UserRow = { id: string; employee_code: string; name: string; role: string }
type RecordRow = { user_id: string; clock_in: string | null; clock_out: string | null }

export default async function AdminPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')

  if (payload.role !== 'admin' && payload.role !== 'manager') {
    redirect('/dashboard')
  }

  const db = withCompany(payload.company_id)
  const today = getTodayJST()

  const { data: users } = await db
    .select('users', 'id, employee_code, name, role')
    .eq('is_active', true)
    .order('employee_code', { ascending: true })

  const { data: todayRecords } = await db
    .select('attendance_records', 'user_id, clock_in, clock_out')
    .eq('work_date', today)

  const recordMap = new Map(
    ((todayRecords ?? []) as unknown as RecordRow[]).map((r) => [r.user_id, r])
  )

  const statusCounts = { clocked_in: 0, clocked_out: 0, not_clocked: 0 }
  const userList = ((users ?? []) as unknown as UserRow[]).map((u) => {
    const r = recordMap.get(u.id)
    const status = r ? (r.clock_out ? 'clocked_out' : 'clocked_in') : 'not_clocked'
    statusCounts[status]++
    return { ...u, today_status: status, clock_in: r?.clock_in ?? null }
  })

  const [y, m, d] = today.split('-')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-blue-600 text-lg">KintaiApp 管理画面</span>
        <div className="flex items-center gap-3">
          <a href="/admin/attendance" className="text-xs text-blue-500 hover:underline">勤怠管理</a>
          <a href="/admin/requests" className="text-xs text-blue-500 hover:underline">申請承認</a>
          <a href="/admin/monthly-closing" className="text-xs text-blue-500 hover:underline">月次締め</a>
          <a href="/admin/payslips" className="text-xs text-blue-500 hover:underline">給与明細</a>
          <a href="/admin/users" className="text-xs text-blue-500 hover:underline">社員管理</a>
          <a href="/admin/settings" className="text-xs text-blue-500 hover:underline">会社設定</a>
          <span className="text-sm text-gray-600">{payload.name}</span>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-xs text-gray-400 hover:text-gray-600">
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <h1 className="text-xl font-bold">
          本日の出勤状況 — {y}年{m}月{d}日
        </h1>

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
                      {u.today_status === 'clocked_in' && (
                        <Badge className="bg-green-500 text-white text-xs">出勤中</Badge>
                      )}
                      {u.today_status === 'clocked_out' && (
                        <Badge variant="secondary" className="text-xs">退勤済</Badge>
                      )}
                      {u.today_status === 'not_clocked' && (
                        <Badge variant="destructive" className="text-xs">未打刻</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-gray-500">
                      {u.clock_in
                        ? new Date(u.clock_in).toLocaleTimeString('ja-JP', {
                            timeZone: 'Asia/Tokyo',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
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
