import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AdminUserActions } from '@/components/AdminUserActions'
import { AdminSidebar } from '@/components/AdminSidebar'

const ROLE_LABELS: Record<string, string> = { employee: '一般', manager: 'マネージャー', admin: '管理者' }
const SALARY_LABELS: Record<string, string> = { monthly: '月給', hourly: '時給' }

type UserRow = {
  id: string; employee_code: string; name: string; email: string
  role: string; salary_type: string; base_salary: number
  hired_at: string; is_active: boolean; force_password_change: boolean
}

export default async function AdminUsersPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')

  if (payload.role !== 'admin') redirect('/dashboard')

  const db = withCompany(payload.company_id)

  const { data } = await db
    .select('users', 'id, employee_code, name, email, role, salary_type, base_salary, hired_at, is_active, force_password_change')
    .order('employee_code')

  const users = (data ?? []) as unknown as UserRow[]

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} />

      <main className="flex-1 p-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">社員管理</h1>
          <a href="/admin/users/new"
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700">
            + 新規登録
          </a>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">社員一覧 ({users.length}名)</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left">社員番号</th>
                  <th className="px-3 py-2 text-left">氏名</th>
                  <th className="px-3 py-2 text-center">権限</th>
                  <th className="px-3 py-2 text-left">給与</th>
                  <th className="px-3 py-2 text-left">入社日</th>
                  <th className="px-3 py-2 text-center">状態</th>
                  <th className="px-3 py-2 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={`border-b hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2 text-gray-500">{u.employee_code}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{u.name}</span>
                      {u.force_password_change && (
                        <span className="ml-1 text-xs text-orange-500">要PW変更</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge variant={u.role === 'admin' ? 'destructive' : u.role === 'manager' ? 'default' : 'secondary'} className="text-xs">
                        {ROLE_LABELS[u.role] ?? u.role}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {SALARY_LABELS[u.salary_type]}
                      <span className="text-gray-400 ml-1">¥{(u.base_salary ?? 0).toLocaleString()}</span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">{u.hired_at?.slice(0, 10) ?? '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {u.is_active ? '在籍' : '退職'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <AdminUserActions userId={u.id} isActive={u.is_active} isSelf={u.id === payload.user_id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
