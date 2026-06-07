import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MonthlyClosingClient } from '@/components/MonthlyClosingClient'

type SearchParams = Promise<{ year?: string; month?: string }>

export default async function MonthlyClosingPage({ searchParams }: { searchParams: SearchParams }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')

  if (payload.role !== 'admin' && payload.role !== 'manager') {
    redirect('/dashboard')
  }

  const sp = await searchParams
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))

  let year = sp.year ? parseInt(sp.year) : now.getFullYear()
  let month = sp.month ? parseInt(sp.month) : now.getMonth()
  if (month === 0) { month = 12; year-- }

  const db = withCompany(payload.company_id)

  const [{ data: users }, { data: closings }] = await Promise.all([
    db.select('users', 'id, employee_code, name').eq('is_active', true).order('employee_code'),
    db.select('monthly_closings', 'id, user_id, employee_confirmed_at, closed_at')
      .eq('year', year)
      .eq('month', month),
  ])

  type UserRow = { id: string; employee_code: string; name: string }
  type ClosingRow = { id: string; user_id: string; employee_confirmed_at: string | null; closed_at: string | null }

  const closingMap = new Map(
    ((closings ?? []) as unknown as ClosingRow[]).map((c) => [c.user_id, c])
  )

  const userStatuses = ((users ?? []) as unknown as UserRow[]).map((u) => {
    const c = closingMap.get(u.id)
    return {
      user_id: u.id,
      employee_code: u.employee_code,
      name: u.name,
      closing_id: c?.id ?? null,
      employee_confirmed_at: c?.employee_confirmed_at ?? null,
      closed_at: c?.closed_at ?? null,
    }
  })

  const closedCount = userStatuses.filter((u) => u.closed_at).length

  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-blue-600 text-lg">KintaiApp 管理画面</span>
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-xs text-blue-500 hover:underline">ダッシュボード</a>
          <a href="/admin/attendance" className="text-xs text-blue-500 hover:underline">勤怠管理</a>
          <a href="/admin/requests" className="text-xs text-blue-500 hover:underline">申請承認</a>
          <span className="text-sm text-gray-600">{payload.name}</span>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-xs text-gray-400 hover:text-gray-600">ログアウト</button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">月次締め</h1>
          <div className="flex items-center gap-2">
            <a
              href={`/admin/monthly-closing?year=${prevYear}&month=${prevMonth}`}
              className="text-sm text-blue-500 hover:underline"
            >
              ‹ 前月
            </a>
            <span className="font-semibold">{year}年{month}月</span>
            <a
              href={`/admin/monthly-closing?year=${nextYear}&month=${nextMonth}`}
              className="text-sm text-blue-500 hover:underline"
            >
              翌月 ›
            </a>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-gray-500">締め済み</p>
              <p className="text-3xl font-bold text-green-600">{closedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-gray-500">未締め</p>
              <p className="text-3xl font-bold text-orange-500">{userStatuses.length - closedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-gray-500">対象社員数</p>
              <p className="text-3xl font-bold text-gray-700">{userStatuses.length}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{year}年{month}月 締め状態</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyClosingClient
              year={year}
              month={month}
              users={userStatuses}
              isAdmin={payload.role === 'admin'}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
