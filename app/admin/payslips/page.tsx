import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Payslip } from '@/lib/types'
import { AdminSidebar } from '@/components/AdminSidebar'

type SearchParams = Promise<{ year?: string; month?: string; user_id?: string; status?: string }>

function yen(v: number) { return `¥${Math.round(v).toLocaleString()}` }

type UserRow = { id: string; name: string; employee_code: string }

export default async function AdminPayslipsPage({ searchParams }: { searchParams: SearchParams }) {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')

  if (payload.role !== 'admin' && payload.role !== 'manager') redirect('/dashboard')

  const sp = await searchParams
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  const year   = sp.year   ? parseInt(sp.year)   : now.getFullYear()
  const month  = sp.month  ? parseInt(sp.month)  : now.getMonth() + 1
  const filterUserId = sp.user_id ?? ''
  const filterStatus = sp.status  ?? ''

  const db = withCompany(payload.company_id)

  const [payslipsRes, allUsersRes] = await Promise.all([
    db.select('payslips', '*').eq('year', year).eq('month', month).order('user_id'),
    db.select('users', 'id, name, employee_code').eq('is_active', true).order('employee_code', { ascending: true }),
  ])

  const allUsers = ((allUsersRes.data ?? []) as unknown as UserRow[])
  let rows = (payslipsRes.data ?? []) as unknown as (Payslip & { status: string })[]

  if (filterUserId) rows = rows.filter((r) => r.user_id === filterUserId)
  if (filterStatus) rows = rows.filter((r) => r.status === filterStatus)

  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const { data: usersForRows } = userIds.length > 0
    ? await db.select('users', 'id, name, employee_code').in('id', userIds)
    : { data: [] }
  const userMap = new Map(((usersForRows ?? []) as unknown as UserRow[]).map((u) => [u.id, u]))

  const prevYear  = month === 1  ? year - 1 : year
  const prevMonth = month === 1  ? 12 : month - 1
  const nextYear  = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1  : month + 1

  const totalGross = rows.reduce((s, r) => s + r.gross_pay, 0)
  const totalNet   = rows.reduce((s, r) => s + r.net_pay,   0)

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} />

      <main className="flex-1 p-6 space-y-4 max-w-5xl">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold">給与明細管理</h1>
          <div className="flex items-center gap-2">
            <a href={`/admin/payslips?year=${prevYear}&month=${prevMonth}`} className="text-sm text-blue-500 hover:underline">‹ 前月</a>
            <span className="font-semibold">{year}年{month}月</span>
            <a href={`/admin/payslips?year=${nextYear}&month=${nextMonth}`} className="text-sm text-blue-500 hover:underline">翌月 ›</a>
          </div>
        </div>

        {/* 絞り込みフォーム */}
        <form method="GET" className="flex gap-2 flex-wrap bg-white p-3 rounded-lg border text-sm">
          <input type="hidden" name="year"  value={year}  />
          <input type="hidden" name="month" value={month} />
          <select name="user_id" defaultValue={filterUserId} className="border rounded px-2 py-1">
            <option value="">全社員</option>
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}（{u.employee_code}）</option>
            ))}
          </select>
          <select name="status" defaultValue={filterStatus} className="border rounded px-2 py-1">
            <option value="">全ステータス</option>
            <option value="draft">下書き</option>
            <option value="published">公開済</option>
          </select>
          <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700">絞り込み</button>
          {(filterUserId || filterStatus) && (
            <a href={`/admin/payslips?year=${year}&month=${month}`} className="text-xs text-gray-400 hover:text-gray-600 self-center">クリア</a>
          )}
        </form>

        {rows.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-gray-500">総支給額合計</p>
                <p className="text-2xl font-bold text-blue-700">{yen(totalGross)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 text-center">
                <p className="text-xs text-gray-500">差引支給額合計</p>
                <p className="text-2xl font-bold text-green-700">{yen(totalNet)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>{year}年{month}月 明細一覧 {(filterUserId || filterStatus) && <span className="text-xs font-normal text-gray-400">（絞り込み中）</span>}</span>
              {rows.length > 0 && (
                <a
                  href={`/api/admin/payslips/export?year=${year}&month=${month}${filterUserId ? `&user_id=${filterUserId}` : ''}`}
                  className="text-xs text-blue-500 hover:underline"
                >
                  賃金台帳CSV (28列) ダウンロード
                </a>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <p className="text-sm text-gray-400 p-4">給与明細がありません。「生成」ボタンで作成してください。</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left">社員</th>
                    <th className="px-3 py-2 text-right">総支給額</th>
                    <th className="px-3 py-2 text-right">控除</th>
                    <th className="px-3 py-2 text-right">差引支給額</th>
                    <th className="px-3 py-2 text-center">出勤</th>
                    <th className="px-3 py-2 text-center">残業h</th>
                    <th className="px-3 py-2 text-center">状態</th>
                    <th className="px-3 py-2 text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const u = userMap.get(p.user_id)
                    return (
                      <tr key={p.id} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <span className="font-medium">{u?.name ?? '—'}</span>
                          <span className="text-xs text-gray-400 ml-1">{u?.employee_code}</span>
                        </td>
                        <td className="px-3 py-2 text-right">{yen(p.gross_pay)}</td>
                        <td className="px-3 py-2 text-right text-red-600">-{yen(p.total_deduction)}</td>
                        <td className="px-3 py-2 text-right font-bold text-blue-700">{yen(p.net_pay)}</td>
                        <td className="px-3 py-2 text-center">{p.work_days}日</td>
                        <td className="px-3 py-2 text-center">{Number(p.overtime_hours).toFixed(1)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {p.status === 'published' ? '公開済' : '下書き'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex gap-2 justify-center">
                            <a href={`/admin/payslips/${p.id}/edit`} className="text-xs text-blue-500 hover:underline">明細編集</a>
                            <a href={`/api/admin/payslips/${p.id}/pdf`} target="_blank" className="text-xs text-gray-500 hover:underline">PDF</a>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
