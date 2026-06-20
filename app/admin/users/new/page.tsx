import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { Card, CardContent } from '@/components/ui/card'
import { UserForm } from '@/components/UserForm'

type PatternRow = { id: string; name: string; is_default: boolean }

export default async function NewUserPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin') redirect('/admin/users')

  const db = withCompany(payload.company_id)
  const { data } = await db.select('work_rule_patterns', 'id, name, is_default').order('is_default', { ascending: false })
  const patterns = (data ?? []) as unknown as PatternRow[]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-4">
        <a href="/admin/users" className="text-xs text-blue-500 hover:underline">← 社員管理</a>
        <span className="font-bold text-blue-600">KintaiApp 管理画面</span>
      </header>
      <main className="max-w-xl mx-auto p-4">
        <h1 className="text-xl font-bold mb-4">社員新規登録</h1>
        <Card>
          <CardContent className="pt-4">
            <UserForm mode="create" patterns={patterns} />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
