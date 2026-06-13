import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AdminRequestActions } from '@/components/AdminRequestActions'
import { AdminSidebar } from '@/components/AdminSidebar'

const TYPE_LABELS: Record<string, string> = {
  leave_paid: '有給',
  leave_special: '特休',
  overtime: '残業',
  attendance_fix: '打刻修正',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '審査中',
  approved: '承認済',
  rejected: '却下',
}

type RequestRow = {
  id: string
  type: string
  target_date: string | null
  reason: string
  status: string
  rejection_reason: string | null
  created_at: string
  user_id: string
}

type UserRow = { id: string; name: string; employee_code: string }

function RequestTable({
  requests,
  userMap,
}: {
  requests: RequestRow[]
  userMap: Map<string, UserRow>
}) {
  if (requests.length === 0) {
    return <p className="text-sm text-gray-400 p-4">申請はありません</p>
  }
  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b">
        <tr>
          <th className="px-3 py-2 text-left">社員</th>
          <th className="px-3 py-2 text-left">種別</th>
          <th className="px-3 py-2 text-left">対象日</th>
          <th className="px-3 py-2 text-left">理由</th>
          <th className="px-3 py-2 text-center">状態</th>
          <th className="px-3 py-2 text-left">申請日</th>
          <th className="px-3 py-2 text-left">操作</th>
        </tr>
      </thead>
      <tbody>
        {requests.map((r) => {
          const u = userMap.get(r.user_id)
          return (
            <tr key={r.id} className="border-b hover:bg-gray-50">
              <td className="px-3 py-2">
                <span className="font-medium">{u?.name ?? '—'}</span>
                <span className="text-xs text-gray-400 ml-1">{u?.employee_code}</span>
              </td>
              <td className="px-3 py-2">{TYPE_LABELS[r.type] ?? r.type}</td>
              <td className="px-3 py-2">{r.target_date ?? '—'}</td>
              <td className="px-3 py-2 max-w-xs">
                <p className="truncate">{r.reason}</p>
                {r.status === 'rejected' && r.rejection_reason && (
                  <p className="text-xs text-red-500 mt-0.5">却下: {r.rejection_reason}</p>
                )}
              </td>
              <td className="px-3 py-2 text-center">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[r.status]}`}>
                  {STATUS_LABELS[r.status] ?? r.status}
                </span>
              </td>
              <td className="px-3 py-2 text-gray-500">
                {new Date(r.created_at).toLocaleDateString('ja-JP')}
              </td>
              <td className="px-3 py-2">
                {r.status === 'pending' && <AdminRequestActions requestId={r.id} />}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default async function AdminRequestsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')

  if (payload.role !== 'admin' && payload.role !== 'manager') {
    redirect('/dashboard')
  }

  const db = withCompany(payload.company_id)

  const { data: allRequests } = await db
    .select('requests', 'id, type, target_date, reason, status, rejection_reason, created_at, user_id')
    .order('created_at', { ascending: false })
    .limit(100)

  const rows = (allRequests ?? []) as unknown as RequestRow[]
  const userIds = [...new Set(rows.map((r) => r.user_id))]

  const { data: users } = await db
    .select('users', 'id, name, employee_code')
    .in('id', userIds)

  const userMap = new Map(
    ((users ?? []) as unknown as UserRow[]).map((u) => [u.id, u])
  )

  const pendingRows = rows.filter((r) => r.status === 'pending')
  const allRows = rows

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} />

      <main className="flex-1 p-6 space-y-4 max-w-5xl">
        <h1 className="text-xl font-bold">申請承認</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              承認待ち
              {pendingRows.length > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                  {pendingRows.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <RequestTable requests={pendingRows} userMap={userMap} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">全申請一覧</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <RequestTable requests={allRows} userMap={userMap} />
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
