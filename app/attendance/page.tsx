import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { AttendanceRecord } from '@/lib/types'

function formatMinutes(minutes: number | null): string {
  if (minutes === null) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

function formatTime(ts: string | null): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const STATUS_LABELS: Record<string, string> = {
  present: '出勤',
  absent: '欠勤',
  late: '遅刻',
  leave_paid: '有給',
  leave_special: '特休',
}

export default async function AttendancePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')

  const db = withCompany(payload.company_id)
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

  const { data: records } = await db
    .select('attendance_records')
    .eq('user_id', payload.user_id)
    .gte('work_date', from)
    .lte('work_date', to)
    .order('work_date', { ascending: false })

  const typedRecords = (records ?? []) as unknown as AttendanceRecord[]
  const totalActual = typedRecords.reduce((s, r) => s + (r.actual_minutes ?? 0), 0)
  const totalOvertime = typedRecords.reduce((s, r) => s + (r.overtime_minutes ?? 0), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-blue-600 text-lg">KintaiApp</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{payload.name}</span>
          <a href="/dashboard" className="text-xs text-blue-500 hover:underline">ダッシュボード</a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <h1 className="text-xl font-bold">
          {year}年{month}月 勤怠履歴
        </h1>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Card>
            <CardContent className="pt-3 text-center">
              <p className="text-gray-500">実働合計</p>
              <p className="text-xl font-bold">{formatMinutes(totalActual)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-3 text-center">
              <p className="text-gray-500">残業合計</p>
              <p
                className={`text-xl font-bold ${
                  totalOvertime > 45 * 60
                    ? 'text-red-600'
                    : totalOvertime > 36 * 60
                    ? 'text-yellow-600'
                    : ''
                }`}
              >
                {formatMinutes(totalOvertime)}
              </p>
            </CardContent>
          </Card>
        </div>

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
                  <th className="px-3 py-2 text-center">区分</th>
                </tr>
              </thead>
              <tbody>
                {typedRecords.map((r) => {
                  const d = new Date(r.work_date)
                  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
                  const isSun = d.getDay() === 0
                  const isSat = d.getDay() === 6
                  return (
                    <tr key={r.id} className="border-b hover:bg-gray-50">
                      <td className={`px-3 py-2 ${isSun ? 'text-red-600' : isSat ? 'text-blue-600' : ''}`}>
                        {r.work_date.slice(5)}（{dow}）
                      </td>
                      <td className="px-3 py-2 text-center">{formatTime(r.clock_in)}</td>
                      <td className={`px-3 py-2 text-center ${!r.clock_out ? 'text-red-500' : ''}`}>
                        {formatTime(r.clock_out)}
                      </td>
                      <td className="px-3 py-2 text-center">{formatMinutes(r.actual_minutes)}</td>
                      <td className={`px-3 py-2 text-center ${(r.overtime_minutes ?? 0) > 0 ? 'text-orange-500 font-medium' : ''}`}>
                        {formatMinutes(r.overtime_minutes)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className="text-xs">
                          {STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
                {typedRecords.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-gray-400">
                      今月の打刻データはありません
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
