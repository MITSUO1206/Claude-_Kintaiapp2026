import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { AttendanceRecord } from '@/lib/types'

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

type UserRow = { id: string; employee_code: string; name: string }

type SearchParams = Promise<{
  year?: string; month?: string; user_id?: string; alert?: string
}>

export default async function AdminAttendancePage({ searchParams }: { searchParams: SearchParams }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin' && payload.role !== 'manager') redirect('/dashboard')

  const params = await searchParams
  const db = withCompany(payload.company_id)
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))

  const year  = params.year  ? parseInt(params.year)  : now.getFullYear()
  const month = params.month ? parseInt(params.month) : now.getMonth() + 1
  const from  = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to    = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  let usersQuery = db.select('users', 'id, employee_code, name').eq('is_active', true)
  if (params.user_id) usersQuery = usersQuery.eq('id', params.user_id)
  const { data: users } = await usersQuery.order('employee_code', { ascending: true })

  const { data: records } = await db
    .select('attendance_records')
    .gte('work_date', from)
    .lte('work_date', to)

  const typedUsers   = (users   ?? []) as unknown as UserRow[]
  const typedRecords = (records ?? []) as unknown as AttendanceRecord[]

  const aggregated = typedUsers.map((user) => {
    const userRecords = typedRecords.filter((r) => r.user_id === user.id)
    const total_days  = userRecords.filter((r) => r.status === 'present').length
    const total_min   = userRecords.reduce((s, r) => s + (r.actual_minutes   ?? 0), 0)
    const ot_min      = userRecords.reduce((s, r) => s + (r.overtime_minutes ?? 0), 0)
    const night_min   = userRecords.reduce((s, r) => s + r.night_minutes, 0)
    const holiday_days = userRecords.filter((r) => r.is_holiday_work).length
    return { ...user, total_days, total_min, ot_min, night_min, holiday_days }
  }).filter((u) => {
    if (params.alert === 'overtime45') return u.ot_min > 45 * 60
    if (params.alert === 'overtime36') return u.ot_min > 36 * 60
    return true
  })

  const csvUrl = `/api/admin/attendance/export?year=${year}&month=${month}${params.user_id ? `&user_id=${params.user_id}` : ''}`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-blue-600 text-lg">KintaiApp 管理画面</span>
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-xs text-blue-500 hover:underline">ダッシュボード</a>
          <span className="text-sm text-gray-600">{payload.name}</span>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-xs text-gray-400 hover:text-gray-600">ログアウト</button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">社員勤怠一覧 — {year}年{month}月</h1>
          <a
            href={csvUrl}
            className="text-sm bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700"
          >
            CSV ダウンロード
          </a>
        </div>

        <form method="GET" className="flex gap-2 flex-wrap bg-white p-3 rounded-lg border text-sm">
          <select name="year" defaultValue={year} className="border rounded px-2 py-1">
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
          <select name="month" defaultValue={month} className="border rounded px-2 py-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
          <select name="alert" defaultValue={params.alert ?? ''} className="border rounded px-2 py-1">
            <option value="">アラートなし（全員）</option>
            <option value="overtime36">36h超</option>
            <option value="overtime45">45h超</option>
          </select>
          <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">
            絞り込み
          </button>
        </form>

        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left">社員番号</th>
                  <th className="px-3 py-2 text-left">氏名</th>
                  <th className="px-3 py-2 text-center">出勤日数</th>
                  <th className="px-3 py-2 text-center">実働</th>
                  <th className="px-3 py-2 text-center">残業</th>
                  <th className="px-3 py-2 text-center">深夜</th>
                  <th className="px-3 py-2 text-center">休日出勤</th>
                  {payload.role === 'admin' && (
                    <th className="px-3 py-2 text-center">操作</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {aggregated.map((u) => (
                  <tr key={u.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500">{u.employee_code}</td>
                    <td className="px-3 py-2 font-medium">{u.name}</td>
                    <td className="px-3 py-2 text-center">{u.total_days}</td>
                    <td className="px-3 py-2 text-center">{formatMinutes(u.total_min)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={
                        u.ot_min > 45 * 60 ? 'text-red-600 font-bold' :
                        u.ot_min > 36 * 60 ? 'text-yellow-600 font-bold' : ''
                      }>
                        {formatMinutes(u.ot_min)}
                      </span>
                      {u.ot_min > 45 * 60 && (
                        <Badge className="ml-1 text-xs bg-red-500 text-white">45h超</Badge>
                      )}
                      {u.ot_min > 36 * 60 && u.ot_min <= 45 * 60 && (
                        <Badge className="ml-1 text-xs bg-yellow-500 text-white">36h超</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-purple-600">{formatMinutes(u.night_min)}</td>
                    <td className="px-3 py-2 text-center">{u.holiday_days > 0 ? u.holiday_days : '—'}</td>
                    {payload.role === 'admin' && (
                      <td className="px-3 py-2 text-center">
                        <a
                          href={`/admin/attendance?user_id=${u.id}&year=${year}&month=${month}`}
                          className="text-xs text-blue-500 hover:underline"
                        >
                          詳細
                        </a>
                      </td>
                    )}
                  </tr>
                ))}
                {aggregated.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                      データがありません
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
