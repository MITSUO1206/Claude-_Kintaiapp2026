import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { PayslipItemEditor } from '@/components/PayslipItemEditor'
import type { Payslip, PayslipItem } from '@/lib/types'

function yen(v: number) { return `¥${Math.round(v).toLocaleString()}` }

export default async function EditPayslipPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin') redirect('/admin/payslips')

  const { id } = await params
  const db = withCompany(payload.company_id)

  const { data: payslip } = await db.select('payslips', '*').eq('id', id).single()
  const p = payslip as unknown as Payslip | null
  if (!p) redirect('/admin/payslips')

  const { data: items } = await db.raw
    .from('payslip_items')
    .select('*')
    .eq('company_id', payload.company_id)
    .eq('payslip_id', id)
    .eq('is_active', true)
    .order('sort_order')

  const { data: user } = await db
    .select('users', 'name, employee_code')
    .eq('id', p.user_id)
    .single()

  type UserRow = { name: string; employee_code: string }
  const u = (user as unknown as UserRow | null) ?? { name: '—', employee_code: '—' }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-blue-600 text-lg">KintaiApp 管理画面</span>
        <div className="flex items-center gap-3">
          <a href="/admin/payslips" className="text-xs text-blue-500 hover:underline">← 給与明細一覧</a>
          <span className="text-sm text-gray-600">{payload.name}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4">
        <div>
          <h1 className="text-xl font-bold">給与明細編集</h1>
          <p className="text-sm text-gray-500">
            {u.name}（{u.employee_code}）— {p.year}年{p.month}月
            {p.status === 'published' && (
              <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">公開済み</span>
            )}
            {p.status === 'draft' && (
              <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">下書き</span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="bg-white rounded border p-3 text-center">
            <p className="text-gray-400 text-xs">総支給額</p>
            <p className="font-bold text-blue-700">{yen(p.gross_pay)}</p>
          </div>
          <div className="bg-white rounded border p-3 text-center">
            <p className="text-gray-400 text-xs">控除合計</p>
            <p className="font-bold text-red-600">-{yen(p.total_deduction)}</p>
          </div>
          <div className="bg-white rounded border p-3 text-center">
            <p className="text-gray-400 text-xs">差引支給額</p>
            <p className="font-bold text-green-700">{yen(p.net_pay)}</p>
          </div>
        </div>

        <PayslipItemEditor
          payslipId={id}
          initialItems={(items ?? []) as unknown as PayslipItem[]}
          isPublished={p.status === 'published'}
          year={p.year}
          month={p.month}
        />
      </main>
    </div>
  )
}
