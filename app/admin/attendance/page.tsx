import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { AdminSidebar } from '@/components/AdminSidebar'
import type { AttendanceRecord } from '@/lib/types'

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

function formatTime(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })
}

type UserRow = { id: string; employee_code: string; name: string }
type ClosingRow = { user_id: string; employee_confirmed_at: string | null; closed_at: string | null }

type SearchParams = Promise<{ year?: string; month?: string; user_id?: string; alert?: string }>

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

  const [usersRes, allUsersRes, recordsRes, closingsRes] = await Promise.all([
    params.user_id
      ? db.select('users', 'id, employee_code, name').eq('id', params.user_id)
      : db.select('users', 'id, employee_code, name').eq('is_active', true).order('employee_code', { ascending: true }),
    db.select('users', 'id, employee_code, name').eq('is_active', true).order('employee_code', { ascending: true }),
    db.select('attendance_records').gte('work_date', from).lte('work_date', to),
    db.select('monthly_closings', 'user_id, employee_confirmed_at, closed_at').eq('year', year).eq('month', month),
  ])

  const allUsers     = ((allUsersRes.data  ?? []) as unknown as UserRow[])
  const typedUsers   = ((usersRes.data     ?? []) as unknown as UserRow[])
  const typedRecords = ((recordsRes.data   ?? []) as unknown as AttendanceRecord[])
  const closingMap   = new Map(((closingsRes.data ?? []) as unknown as ClosingRow[]).map((c) => [c.user_id, c]))

  const isDetailView = !!params.user_id
  const selectedUser = isDetailView ? typedUsers[0] : null

  // 詳細ビュー: 1人の日別記録
  if (isDetailView && selectedUser) {
    const userRecords = typedRecords
      .filter((r) => r.user_id === selectedUser.id)
      .sort((a, b) => a.work_date.localeCompare(b.work_date))

    return (
      <div className="flex min-h-screen bg-gray-50">
        <AdminSidebar userName={payload.name} />
        <main className="flex-1 p-6 space-y-4 max-w-4xl">
          <div className="flex items-center gap-3">
            <a href={`/admin/attendance?year=${year}&month=${month}`} className="text-sm text-blue-500 hover:underline">← 一覧に戻る</a>
          </div>
          <h1 className="text-2xl font-bold text-gray-800">{selectedUser.name}（{selectedUser.employee_code}）— {year}年{month}月</h1>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left">日付</th>
                    <th className="px-3 py-2 text-center">出勤</th>
                    <th className="px-3 py-2 text-center">退勤</th>
                    <th className="px-3 py-2 text-center">実働</th>
                    <th className="px-3 py-2 text-center">残業</th>
                    <th className="px-3 py-2 text-center text-purple-600">深夜</th>
                    {payload.role === 'admin' && <th className="px-3 py-2 text-center">操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {userRecords.map((r) => {
                    const d = new Date(r.work_date + 'T00:00:00')
                    const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
                    const isSun = d.getDay() === 0
                    return (
                      <tr key={r.id} className="border-b hover:bg-gray-50">
                        <td className={`px-3 py-2 ${isSun || r.is_holiday_work ? 'text-red-600' : d.getDay() === 6 ? 'text-blue-600' : ''}`}>
                          {r.work_date.slice(5)}（{dow}）
                        </td>
                        <td className="px-3 py-2 text-center">{formatTime(r.clock_in)}</td>
                        <td className={`px-3 py-2 text-center ${!r.clock_out ? 'text-red-400' : ''}`}>{formatTime(r.clock_out)}</td>
                        <td className="px-3 py-2 text-center">{formatMinutes(r.actual_minutes ?? 0)}</td>
                        <td className={`px-3 py-2 text-center ${(r.overtime_minutes ?? 0) > 0 ? 'text-orange-500' : ''}`}>{formatMinutes(r.overtime_minutes ?? 0)}</td>
                        <td className={`px-3 py-2 text-center ${r.night_minutes > 0 ? 'text-purple-600' : 'text-gray-400'}`}>{r.night_minutes > 0 ? formatMinutes(r.night_minutes) : '—'}</td>
                        {payload.role === 'admin' && (
                          <td className="px-3 py-2 text-center">
                            <a href={`/admin/attendance/${r.id}/edit`} className="text-xs text-blue-500 hover:underline">管理者修正</a>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                  {userRecords.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">記録がありません</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  // 集計ビュー
  const aggregated = typedUsers.map((user) => {
    const userRecords  = typedRecords.filter((r) => r.user_id === user.id)
    const total_days   = userRecords.filter((r) => r.status === 'present').length
    const total_min    = userRecords.reduce((s, r) => s + (r.actual_minutes   ?? 0), 0)
    const ot_min       = userRecords.reduce((s, r) => s + (r.overtime_minutes ?? 0), 0)
    const night_min    = userRecords.reduce((s, r) => s + r.night_minutes, 0)
    const holiday_days = userRecords.filter((r) => r.is_holiday_work).length
    const closing      = closingMap.get(user.id)
    const closingStatus = closing?.closed_at ? 'closed' : closing?.employee_confirmed_at ? 'confirmed' : 'pending'
    return { ...user, total_days, total_min, ot_min, night_min, holiday_days, closingStatus }
  }).filter((u) => {
    if (params.alert === 'overtime45') return u.ot_min > 45 * 60
    if (params.alert === 'overtime36') return u.ot_min > 36 * 60
    return true
  })

  const csvUrl = `/api/admin/attendance/export?year=${year}&month=${month}${params.user_id ? `&user_id=${params.user_id}` : ''}`

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} />

      <main className="flex-1 p-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">社員勤怠一覧 — {year}年{month}月</h1>
          <a href={csvUrl} className="text-sm bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700">CSV ダウンロード</a>
        </div>

        <form method="GET" className="flex gap-2 flex-wrap bg-white p-3 rounded-xl border text-sm shadow-sm">
          <select name="year" defaultValue={year} className="border rounded-lg px-2 py-1.5">
            {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}年</option>)}
          </select>
          <select name="month" defaultValue={month} className="border rounded-lg px-2 py-1.5">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => <option key={mo} value={mo}>{mo}月</option>)}
          </select>
          <select name="user_id" defaultValue={params.user_id ?? ''} className="border rounded-lg px-2 py-1.5">
            <option value="">全社員</option>
            {allUsers.map((u) => <option key={u.id} value={u.id}>{u.name}（{u.employee_code}）</option>)}
          </select>
          <select name="alert" defaultValue={params.alert ?? ''} className="border rounded-lg px-2 py-1.5">
            <option value="">アラートなし（全員）</option>
            <option value="overtime36">36h超（黄）</option>
            <option value="overtime45">45h超（赤）</option>
          </select>
          <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700">絞り込み</button>
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
                  <th className="px-3 py-2 text-center">締め状態</th>
                  <th className="px-3 py-2 text-center">操作</th>
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
                      <span className={u.ot_min > 45*60 ? 'text-red-600 font-bold' : u.ot_min > 36*60 ? 'text-yellow-600 font-bold' : ''}>
                        {formatMinutes(u.ot_min)}
                      </span>
                      {u.ot_min > 45*60 && <Badge className="ml-1 text-xs bg-red-500 text-white">45h超</Badge>}
                      {u.ot_min > 36*60 && u.ot_min <= 45*60 && <Badge className="ml-1 text-xs bg-yellow-500 text-white">36h超</Badge>}
                    </td>
                    <td className="px-3 py-2 text-center text-purple-600">{formatMinutes(u.night_min)}</td>
                    <td className="px-3 py-2 text-center">{u.holiday_days > 0 ? u.holiday_days : '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {u.closingStatus === 'closed'    && <Badge variant="secondary" className="text-xs">締め済</Badge>}
                      {u.closingStatus === 'confirmed' && <Badge className="text-xs bg-green-500 text-white">確定申請済</Badge>}
                      {u.closingStatus === 'pending'   && <Badge variant="destructive" className="text-xs">未申請</Badge>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <a href={`/admin/attendance?user_id=${u.id}&year=${year}&month=${month}`} className="text-xs text-blue-500 hover:underline">
                        {payload.role === 'admin' ? '管理者修正' : '詳細'}
                      </a>
                    </td>
                  </tr>
                ))}
                {aggregated.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">データがありません</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
