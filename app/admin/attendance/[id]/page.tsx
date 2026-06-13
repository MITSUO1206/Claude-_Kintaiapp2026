import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { AdminSidebar } from '@/components/AdminSidebar'
import { AdminAttendanceClient } from '@/components/admin/AdminAttendanceClient'
import type { AttendanceRecord } from '@/lib/types'

type UserRow = { id: string; employee_code: string; name: string }

function getNowJST(): { year: number; month: number } {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export default async function AdminAttendancePage(
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin' && payload.role !== 'manager') redirect('/dashboard')

  const { id: userId } = await params
  const db = withCompany(payload.company_id)
  const { year, month } = getNowJST()
  const monthFrom = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const monthTo = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const [userRes, recordsRes] = await Promise.all([
    db.select('users', 'id, employee_code, name').eq('id', userId).single(),
    db.select('attendance_records')
      .eq('user_id', userId)
      .gte('work_date', monthFrom)
      .lte('work_date', monthTo)
      .order('work_date', { ascending: true }),
  ])

  const user = userRes.data as unknown as UserRow | null
  if (!user) redirect('/admin')

  const records = ((recordsRes.data ?? []) as unknown as AttendanceRecord[])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} />
      <div className="flex-1 flex flex-col min-h-screen">
        <AdminAttendanceClient
          user={user}
          initialRecords={records}
          initialYear={year}
          initialMonth={month}
        />
      </div>
    </div>
  )
}
