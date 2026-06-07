import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AdminAttendanceEditForm } from '@/components/AdminAttendanceEditForm'
import type { AttendanceRecord } from '@/lib/types'

type UserRow = { name: string; employee_code: string }

export default async function AdminAttendanceEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin') redirect('/admin/attendance')

  const { id } = await params
  const db = withCompany(payload.company_id)

  const { data: record } = await db
    .select('attendance_records')
    .eq('id', id)
    .single()

  if (!record) redirect('/admin/attendance')

  const typedRecord = record as unknown as AttendanceRecord

  const { data: user } = await db
    .select('users', 'name, employee_code')
    .eq('id', typedRecord.user_id)
    .single()

  const typedUser = user as unknown as UserRow | null
  const userName = typedUser
    ? `${typedUser.name}（${typedUser.employee_code}）`
    : '不明'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-blue-600 text-lg">KintaiApp 管理画面</span>
        <a href="/admin/attendance" className="text-xs text-blue-500 hover:underline">← 勤怠一覧</a>
      </header>

      <main className="max-w-lg mx-auto p-4 space-y-4">
        <h1 className="text-xl font-bold">打刻直接修正</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {userName} — {typedRecord.work_date}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <AdminAttendanceEditForm record={typedRecord} userName={userName} />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
