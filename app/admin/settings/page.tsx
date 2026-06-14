import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { verifyJWT } from '@/lib/auth/jwt'
import { withCompany } from '@/lib/db/withCompany'
import { WorkRuleForm } from '@/components/WorkRuleForm'
import { ShiftTypeManager } from '@/components/admin/ShiftTypeManager'
import type { WorkRule } from '@/lib/types'
import { AdminSidebar } from '@/components/AdminSidebar'

type ShiftRow = { id: string; label: string; sort_order: number }

export default async function AdminSettingsPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth_token')?.value
  if (!token) redirect('/login')

  const payload = await verifyJWT(token).catch(() => null)
  if (!payload) redirect('/login')
  if (payload.role !== 'admin') redirect('/admin')

  const db = withCompany(payload.company_id)
  const [{ data: rule }, shiftRes] = await Promise.all([
    db.select('work_rules', '*').single(),
    db.select('shift_types', 'id, label, sort_order').eq('is_active', true).order('sort_order', { ascending: true }),
  ])

  const shiftTypes = ((shiftRes.data ?? []) as unknown as ShiftRow[])

  return (
    <div className="flex min-h-screen bg-gray-50">
      <AdminSidebar userName={payload.name} />
      <main className="flex-1 p-6 space-y-6 max-w-lg">
        <h1 className="text-2xl font-bold text-gray-800">会社設定</h1>
        <WorkRuleForm initialRule={rule as unknown as WorkRule | null} />
        <ShiftTypeManager initialShiftTypes={shiftTypes} />
      </main>
    </div>
  )
}
