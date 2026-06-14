import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { EmployeeSidebar } from '@/components/EmployeeSidebar'
import type { Payslip, PayslipItem } from '@/lib/types'

function yen(v: number) { return `¥${Math.round(v).toLocaleString()}` }

export default async function PayslipDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')

  const { id } = await params
  const db = withCompany(payload.company_id)

  const { data: payslip } = await db.select('payslips', '*').eq('id', id).single()
  const p = payslip as unknown as Payslip | null

  // 自分の明細のみ閲覧可能（管理者は全員OK）
  if (!p) redirect('/payslips')
  if (payload.role !== 'admin' && payload.role !== 'manager' && p.user_id !== payload.user_id) {
    redirect('/payslips')
  }

  const { data: itemsData } = await db.raw
    .from('payslip_items')
    .select('*')
    .eq('company_id', payload.company_id)
    .eq('payslip_id', id)
    .eq('is_active', true)
    .order('sort_order')

  const items = (itemsData ?? []) as unknown as PayslipItem[]
  const incomeItems     = items.filter((i) => i.category === 'income')
  const deductionItems  = items.filter((i) => i.category === 'deduction')
  const adjustmentItems = items.filter((i) => i.category === 'adjustment')

  const totalIncome     = incomeItems.reduce((s, i) => s + i.amount, 0) + adjustmentItems.reduce((s, i) => s + i.amount, 0)
  const totalDeduction  = deductionItems.reduce((s, i) => s + i.amount, 0)
  const netPay          = totalIncome - totalDeduction

  return (
    <div className="flex min-h-screen bg-gray-50">
      <EmployeeSidebar userName={payload.name} />

      <main className="flex-1 p-6 max-w-2xl">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 mb-6">
          <a href="/payslips" className="text-xs text-blue-500 hover:underline">← 明細一覧</a>
        </div>

        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          {/* タイトル帯 */}
          <div className="bg-blue-600 text-white px-6 py-4">
            <p className="text-sm opacity-80">給与明細書</p>
            <h1 className="text-xl font-bold mt-0.5">{p.year}年{p.month}月分</h1>
            <p className="text-sm opacity-80 mt-1">{payload.name}</p>
          </div>

          {/* 勤怠サマリー */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-px bg-gray-200 border-b">
            {[
              { label: '出勤日数', value: `${p.work_days}日` },
              { label: '実働時間', value: `${Number(p.actual_hours).toFixed(1)}h` },
              { label: '残業時間', value: `${Number(p.overtime_hours).toFixed(1)}h` },
              { label: '有給日数', value: `${p.paid_leave_days}日` },
              { label: '欠勤日数', value: `${p.absent_days}日` },
            ].map((item) => (
              <div key={item.label} className="bg-white px-3 py-3 text-center">
                <p className="text-xs text-gray-400">{item.label}</p>
                <p className="text-sm font-semibold text-gray-700 mt-0.5">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="p-6 space-y-6">
            {/* 支給 */}
            <section>
              <h2 className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2">支給</h2>
              <div className="space-y-1">
                {incomeItems.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm py-1 border-b border-gray-50">
                    <span className="text-gray-600">{item.label}</span>
                    <span className="font-medium">{yen(item.amount)}</span>
                  </div>
                ))}
                {adjustmentItems.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm py-1 border-b border-gray-50">
                    <span className="text-gray-600">{item.label}</span>
                    <span className={`font-medium ${item.amount < 0 ? 'text-red-500' : ''}`}>{yen(item.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-sm font-bold pt-2 mt-1">
                <span className="text-blue-700">支給合計</span>
                <span className="text-blue-700">{yen(totalIncome)}</span>
              </div>
            </section>

            {/* 控除 */}
            <section>
              <h2 className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">控除</h2>
              <div className="space-y-1">
                {deductionItems.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm py-1 border-b border-gray-50">
                    <span className="text-gray-600">{item.label}</span>
                    <span className="font-medium text-red-500">-{yen(item.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-sm font-bold pt-2 mt-1">
                <span className="text-red-600">控除合計</span>
                <span className="text-red-600">-{yen(totalDeduction)}</span>
              </div>
            </section>

            {/* 差引支給額 */}
            <div className="bg-green-50 border border-green-200 rounded-lg px-5 py-4 flex justify-between items-center">
              <span className="font-bold text-gray-700">差引支給額（手取り）</span>
              <span className="text-2xl font-bold text-green-700">{yen(netPay)}</span>
            </div>

            {p.status === 'draft' && (
              <p className="text-xs text-gray-400 text-center">※ この明細は確定前の内容です。変更になる場合があります。</p>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
