import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Payslip } from '@/lib/types'

function yen(v: number) {
  return `¥${Math.round(v).toLocaleString()}`
}

export default async function PayslipsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')

  const db = withCompany(payload.company_id)

  const { data } = await db
    .select('payslips', 'id, year, month, gross_pay, net_pay, total_deduction, work_days, actual_hours, overtime_hours, is_finalized')
    .eq('user_id', payload.user_id)
    .order('year', { ascending: false })
    .limit(24)

  const payslips = (data ?? []) as unknown as Partial<Payslip>[]

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <span className="font-bold text-blue-600 text-lg">KintaiApp</span>
        <div className="flex items-center gap-3">
          <a href="/dashboard" className="text-xs text-blue-500 hover:underline">ダッシュボード</a>
          <a href="/attendance" className="text-xs text-blue-500 hover:underline">勤怠履歴</a>
          <a href="/requests" className="text-xs text-blue-500 hover:underline">申請</a>
          <span className="text-sm text-gray-600">{payload.name}</span>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" className="text-xs text-gray-400 hover:text-gray-600">ログアウト</button>
          </form>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        <h1 className="text-xl font-bold mb-4">給与明細</h1>

        {payslips.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center text-sm text-gray-400">
              給与明細はありません
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">明細一覧</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left">年月</th>
                    <th className="px-3 py-2 text-right">総支給額</th>
                    <th className="px-3 py-2 text-right">控除合計</th>
                    <th className="px-3 py-2 text-right">差引支給額</th>
                    <th className="px-3 py-2 text-center">出勤日数</th>
                    <th className="px-3 py-2 text-center">残業時間</th>
                    <th className="px-3 py-2 text-center">状態</th>
                    <th className="px-3 py-2 text-center">PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {payslips.map((p) => (
                    <tr key={p.id} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{p.year}年{p.month}月</td>
                      <td className="px-3 py-2 text-right">{yen(p.gross_pay ?? 0)}</td>
                      <td className="px-3 py-2 text-right text-red-600">-{yen(p.total_deduction ?? 0)}</td>
                      <td className="px-3 py-2 text-right font-bold text-blue-700">{yen(p.net_pay ?? 0)}</td>
                      <td className="px-3 py-2 text-center">{p.work_days}日</td>
                      <td className="px-3 py-2 text-center">{Number(p.overtime_hours ?? 0).toFixed(1)}h</td>
                      <td className="px-3 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_finalized ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {p.is_finalized ? '確定' : '仮'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <a
                          href={`/api/admin/payslips/${p.id}/pdf`}
                          target="_blank"
                          className="text-xs text-blue-500 hover:underline"
                        >
                          PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
