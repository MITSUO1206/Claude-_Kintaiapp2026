import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { AdminSidebar } from '@/components/AdminSidebar'
import { AttendanceCsvExport } from '@/components/admin/AttendanceCsvExport'

export default async function AdminAttendancePage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin' && payload.role !== 'manager') redirect('/dashboard')

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} />
      <main className="flex-1 p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-800">勤怠管理DB</h1>
        <AttendanceCsvExport />
      </main>
    </div>
  )
}
