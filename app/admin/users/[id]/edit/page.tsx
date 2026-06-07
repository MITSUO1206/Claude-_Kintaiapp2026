import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { Card, CardContent } from '@/components/ui/card'
import { UserForm } from '@/components/UserForm'

type Params = Promise<{ id: string }>

export default async function EditUserPage({ params }: { params: Params }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin') redirect('/admin/users')

  const { id } = await params
  const db = withCompany(payload.company_id)

  const { data: user } = await db
    .select('users', 'id, employee_code, name, email, role, salary_type, base_salary, commuting_allowance, resident_tax, hired_at')
    .eq('id', id)
    .single()

  type UserRow = {
    id: string; employee_code: string; name: string; email: string
    role: string; salary_type: string; base_salary: number
    commuting_allowance: number; resident_tax: number; hired_at: string
  }
  const u = user as unknown as UserRow | null
  if (!u) redirect('/admin/users')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-4">
        <a href="/admin/users" className="text-xs text-blue-500 hover:underline">← 社員管理</a>
        <span className="font-bold text-blue-600">KintaiApp 管理画面</span>
      </header>
      <main className="max-w-xl mx-auto p-4">
        <h1 className="text-xl font-bold mb-4">{u.name} — 編集</h1>
        <Card>
          <CardContent className="pt-4">
            <UserForm
              mode="edit"
              userId={id}
              initial={{
                employee_code: u.employee_code,
                name: u.name,
                email: u.email,
                role: u.role,
                salary_type: u.salary_type,
                base_salary: String(u.base_salary ?? 0),
                commuting_allowance: String(u.commuting_allowance ?? 0),
                resident_tax: String(u.resident_tax ?? 0),
                hired_at: u.hired_at?.slice(0, 10) ?? '',
              }}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
