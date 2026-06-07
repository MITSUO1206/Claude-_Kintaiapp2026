import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { ClockButtons } from '@/components/ClockButtons'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { AttendanceRecord } from '@/lib/types'

function getTodayJST(): string {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return jst.toISOString().split('T')[0]
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')

  const db = withCompany(payload.company_id)
  const today = getTodayJST()

  const { data: todayRecord } = await db
    .select('attendance_records')
    .eq('user_id', payload.user_id)
    .eq('work_date', today)
    .single()

  // アクティブな休憩ログを取得
  let activeBreakStart: string | null = null
  if (todayRecord) {
    const { data: activeBreak } = await db
      .select('break_logs', 'break_start')
      .eq('attendance_id', (todayRecord as unknown as { id: string }).id)
      .is('break_end', null)
      .single()
    activeBreakStart = (activeBreak as unknown as { break_start: string } | null)?.break_start ?? null
  }

  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const monthFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const { data: monthRecords } = await db
    .select('attendance_records', 'actual_minutes, overtime_minutes')
    .eq('user_id', payload.user_id)
    .gte('work_date', monthFrom)
    .lte('work_date', today)

  const totalActual = ((monthRecords ?? []) as unknown as AttendanceRecord[]).reduce(
    (sum, r) => sum + (r.actual_minutes ?? 0), 0
  )
  const totalOvertime = ((monthRecords ?? []) as unknown as AttendanceRecord[]).reduce(
    (sum, r) => sum + (r.overtime_minutes ?? 0), 0
  )

  const dateLabel = today.replace(/(\d{4})-(\d{2})-(\d{2})/, '$1年$2月$3日')
  const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][new Date(today).getDay()]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-blue-600 text-lg">KintaiApp</span>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{payload.name}</span>
          <a href="/attendance" className="text-xs text-blue-500 hover:underline">勤怠履歴</a>
          <a href="/requests" className="text-xs text-blue-500 hover:underline">申請</a>
          <a href="/payslips" className="text-xs text-blue-500 hover:underline">給与明細</a>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-xs text-gray-400 hover:text-gray-600">
              ログアウト
            </button>
          </form>
        </div>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {dateLabel}（{dayOfWeek}）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ClockButtons
              initialRecord={todayRecord as AttendanceRecord | null}
              initialBreakStart={activeBreakStart}
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-gray-500">今月の実働時間</p>
              <p className="text-2xl font-bold">{formatMinutes(totalActual)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-xs text-gray-500">今月の残業時間</p>
              <p
                className={`text-2xl font-bold ${
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
      </main>
    </div>
  )
}
