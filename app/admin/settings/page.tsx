import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { WorkRuleForm } from '@/components/WorkRuleForm'
import type { WorkRule } from '@/lib/types'

export default async function AdminSettingsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin') redirect('/admin')

  const db = withCompany(payload.company_id)
  const { data: rule } = await db.select('work_rules', '*').single()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-blue-600 text-lg">KintaiApp 管理画面</span>
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-xs text-blue-500 hover:underline">ダッシュボード</a>
          <a href="/admin/payslip-templates" className="text-xs text-blue-500 hover:underline">明細テンプレート</a>
          <span className="text-sm text-gray-600">{payload.name}</span>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-xs text-gray-400 hover:text-gray-600">ログアウト</button>
          </form>
        </div>
      </header>
      <main className="max-w-lg mx-auto p-4 space-y-4">
        <h1 className="text-xl font-bold">会社設定（就業規則）</h1>
        <WorkRuleForm initialRule={rule as unknown as WorkRule | null} />
      </main>
    </div>
  )
}
