import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AdminSidebar } from '@/components/AdminSidebar'

type UserRow = { id: string; employee_code: string; name: string; role: string }

export default async function AdminPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin' && payload.role !== 'manager') redirect('/dashboard')

  const db = withCompany(payload.company_id)

  const [usersRes, pendingRes] = await Promise.all([
    db.select('users', 'id, employee_code, name, role').eq('is_active', true).order('employee_code', { ascending: true }),
    db.select('requests', 'id').eq('status', 'pending'),
  ])

  const allUsers = ((usersRes.data ?? []) as unknown as UserRow[]).filter((u) => u.role !== 'admin')
  const pendingCount = (pendingRes.data ?? []).length

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} pendingCount={pendingCount} />

      <main className="flex-1 p-6 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">全社員一覧</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left">社員番号</th>
                  <th className="px-3 py-2 text-left">氏名</th>
                  <th className="px-3 py-2 text-center">勤怠編集</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.map((u) => (
                  <tr key={u.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500">{u.employee_code}</td>
                    <td className="px-3 py-2 font-medium">{u.name}</td>
                    <td className="px-3 py-2 text-center">
                      <a
                        href={`/admin/attendance/${u.id}`}
                        className="text-xs text-blue-500 hover:underline"
                      >
                        勤怠編集
                      </a>
                    </td>
                  </tr>
                ))}
                {allUsers.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-gray-400 text-sm">
                      社員が登録されていません
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
