import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { AdminSidebar } from '@/components/AdminSidebar'
import { LeaveManagementTable } from '@/components/admin/LeaveManagementTable'
import { PaidLeaveObligationAlert } from '@/components/admin/PaidLeaveObligationAlert'
import { processAutoGrants } from '@/lib/leave/autoGrant'
import { calcTenureStr, getNextGrantCycle, toDateStr } from '@/lib/leave/grantCalc'
import type { LeaveUserRow } from '@/components/admin/LeaveManagementTable'

type UserRow = {
  id: string
  company_id: string
  employee_code: string
  name: string
  hired_at: string
  employment_type: string
  weekly_working_days: number
}
type BalanceRow = { user_id: string; total_days: number; used_days: number }
type GrantRow   = { user_id: string; grant_date: string; granted_days: number; basis: string; note: string | null }

export default async function LeaveManagementPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin' && payload.role !== 'manager') redirect('/dashboard')

  const db = withCompany(payload.company_id)
  const fiscalYear = new Date().getFullYear()

  // ユーザー一覧
  const { data: usersData } = await db
    .select('users', 'id, company_id, employee_code, name, hired_at, employment_type, weekly_working_days, role')
    .eq('is_active', true)
    .order('employee_code', { ascending: true })

  const users = ((usersData ?? []) as unknown as (UserRow & { role: string })[])
    .filter((u) => u.role !== 'admin')

  // 遅延評価: 未処理の付与サイクルを処理
  await Promise.allSettled(
    users.map((u) =>
      processAutoGrants({
        id:                  u.id,
        company_id:          u.company_id,
        hired_at:            u.hired_at,
        weekly_working_days: u.weekly_working_days ?? 5,
      })
    )
  )

  const userIds = users.map((u) => u.id)

  const [balancesRes, grantsRes] = await Promise.all([
    supabaseAdmin
      .from('leave_balances')
      .select('user_id, total_days, used_days')
      .eq('company_id', payload.company_id)
      .eq('fiscal_year', fiscalYear)
      .in('user_id', userIds),
    supabaseAdmin
      .from('leave_grants')
      .select('user_id, grant_date, granted_days, basis, note')
      .eq('company_id', payload.company_id)
      .in('user_id', userIds)
      .order('grant_date', { ascending: false }),
  ])

  const balanceMap = new Map(
    ((balancesRes.data ?? []) as unknown as BalanceRow[]).map((b) => [b.user_id, b])
  )
  const grantsMap = new Map<string, GrantRow[]>()
  for (const g of ((grantsRes.data ?? []) as unknown as GrantRow[])) {
    if (!grantsMap.has(g.user_id)) grantsMap.set(g.user_id, [])
    grantsMap.get(g.user_id)!.push(g)
  }

  const rows: LeaveUserRow[] = users.map((u) => {
    const bal        = balanceMap.get(u.id)
    const weeklyDays = u.weekly_working_days ?? 5
    const totalDays  = bal?.total_days ?? 0
    const usedDays   = bal?.used_days  ?? 0
    const next       = getNextGrantCycle(u.hired_at, weeklyDays)

    return {
      id:                  u.id,
      employee_code:       u.employee_code,
      name:                u.name,
      hired_at:            u.hired_at?.slice(0, 10) ?? '',
      tenureStr:           calcTenureStr(u.hired_at),
      employment_type:     u.employment_type ?? 'full_time',
      weekly_working_days: weeklyDays,
      totalDays,
      usedDays,
      remaining:           totalDays - usedDays,
      nextGrantDate:       next ? toDateStr(next.grantDate) : null,
      nextGrantDays:       next?.grantedDays ?? null,
      fiscalYear,
      grants:              grantsMap.get(u.id) ?? [],
    }
  })

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} />

      <main className="flex-1 p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">有給管理</h1>
        <p className="text-sm text-gray-400 mb-4">{fiscalYear}年度 ／ 入社日基準個人サイクル</p>

        <PaidLeaveObligationAlert />

        <div className="mt-4">
          <LeaveManagementTable rows={rows} fiscalYear={fiscalYear} />
        </div>

        <div className="mt-4 text-xs text-gray-400 space-y-1">
          <p>※ 行をクリックすると付与履歴が展開されます。</p>
          <p>※ 「補填」で付与日数を手動設定できます。</p>
          <p>※ 出勤率80%未満の場合は法定付与がスキップされます。</p>
        </div>
      </main>
    </div>
  )
}
