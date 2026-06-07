import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { TemplateManager } from '@/components/TemplateManager'
import type { PayslipTemplate } from '@/lib/types'

export default async function PayslipTemplatesPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin') redirect('/admin')

  const db = withCompany(payload.company_id)
  const { data: templates } = await db.raw
    .from('payslip_templates')
    .select('*')
    .eq('company_id', payload.company_id)
    .eq('is_active', true)
    .order('sort_order')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-blue-600 text-lg">KintaiApp 管理画面</span>
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-xs text-blue-500 hover:underline">ダッシュボード</a>
          <a href="/admin/payslips" className="text-xs text-blue-500 hover:underline">給与明細</a>
          <span className="text-sm text-gray-600">{payload.name}</span>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-xs text-gray-400 hover:text-gray-600">ログアウト</button>
          </form>
        </div>
      </header>
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <h1 className="text-xl font-bold">給与明細テンプレート管理</h1>
        <p className="text-sm text-gray-500">
          テンプレートに登録した項目が給与明細生成時に自動で適用されます。
        </p>
        <TemplateManager initialTemplates={(templates ?? []) as unknown as PayslipTemplate[]} />
      </main>
    </div>
  )
}
