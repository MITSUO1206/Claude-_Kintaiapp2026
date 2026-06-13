import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { UnifiedDashboard } from '@/components/attendance/UnifiedDashboard'
import type { AttendanceRecord, MonthlyApproval } from '@/lib/types'

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

  const [todayRes, monthRes, approvalRes] = await Promise.all([
    db.select('attendance_records')
      .eq('user_id', payload.user_id)
      .eq('work_date', today)
      .single(),
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
  ])

  const todayRecord   = (todayRes.data as unknown as AttendanceRecord | null)
  const monthRecords  = ((monthRes.data ?? []) as unknown as AttendanceRecord[])
  const approval      = (approvalRes.data as unknown as MonthlyApproval | null)

  const summary = {
    total_days:       monthRecords.filter((r) => r.status === 'present').length,
    total_minutes:    monthRecords.reduce((s, r) => s + (r.actual_minutes ?? 0), 0),
    overtime_minutes: monthRecords.reduce((s, r) => s + (r.overtime_minutes ?? 0), 0),
  }

  return (
    <UnifiedDashboard
      userName={payload.name}
      initialDate={today}
      initialRecord={todayRecord}
      initialMonthRecords={monthRecords}
      initialSummary={summary}
      initialApproval={approval}
      initialYear={year}
      initialMonth={month}
    />
  )
}
