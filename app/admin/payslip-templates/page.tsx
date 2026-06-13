import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { TemplateManager } from '@/components/TemplateManager'
import type { PayslipTemplate } from '@/lib/types'
import { AdminSidebar } from '@/components/AdminSidebar'

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
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} />
      <main className="flex-1 p-6 space-y-4 max-w-3xl">
        <h1 className="text-2xl font-bold text-gray-800">給与明細テンプレート管理</h1>
        <p className="text-sm text-gray-500">
          テンプレートに登録した項目が給与明細生成時に自動で適用されます。
        </p>
        <TemplateManager initialTemplates={(templates ?? []) as unknown as PayslipTemplate[]} />
      </main>
    </div>
  )
}
