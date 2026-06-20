import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { UnifiedDashboard } from '@/components/attendance/UnifiedDashboard'
import type { AttendanceRecord, MonthlyApproval, WorkRulePattern } from '@/lib/types'

function getTodayJST(): string {
  const jst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return jst.toISOString().split('T')[0]
}

export default async function DashboardPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')

  const db = withCompany(payload.company_id)
  const today = getTodayJST()
  const [y, m] = today.split('-')
  const year  = parseInt(y)
  const month = parseInt(m)
  const monthFrom = `${y}-${m}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const monthTo = `${y}-${m}-${String(lastDay).padStart(2, '0')}`

  // ユーザーの勤怠パターンIDを取得
  const { data: userRow } = await db
    .select('users', 'work_rule_pattern_id')
    .eq('id', payload.user_id)
    .single()

  type UserPatternRow = { work_rule_pattern_id: string | null }
  const patternId = (userRow as unknown as UserPatternRow | null)?.work_rule_pattern_id ?? null

  const [monthRes, approvalRes, patternRes] = await Promise.all([
    db.select('attendance_records')
      .eq('user_id', payload.user_id)
      .gte('work_date', monthFrom)
      .lte('work_date', monthTo)
      .order('work_date', { ascending: true }),
    db.select('monthly_approvals')
      .eq('user_id', payload.user_id)
      .eq('year', year)
      .eq('month', month)
      .single(),
    patternId
      ? db.select('work_rule_patterns', 'id, name, start_time, end_time, break_minutes').eq('id', patternId).single()
      : Promise.resolve({ data: null }),
  ])

  const monthRecords = ((monthRes.data ?? []) as unknown as AttendanceRecord[])
  const approval     = (approvalRes.data as unknown as MonthlyApproval | null)
  const workPattern  = (patternRes.data as unknown as Pick<WorkRulePattern, 'id' | 'name' | 'start_time' | 'end_time' | 'break_minutes'> | null)

  return (
    <UnifiedDashboard
      userName={payload.name}
      userId={payload.user_id}
      initialMonthRecords={monthRecords}
      initialApproval={approval}
      initialYear={year}
      initialMonth={month}
      workPattern={workPattern}
    />
  )
}
