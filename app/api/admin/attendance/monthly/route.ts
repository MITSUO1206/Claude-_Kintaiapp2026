import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError, AttendanceRecord } from '@/lib/types'

type UserRow = { id: string; employee_code: string; name: string }

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }

    const db = withCompany(payload.company_id)
    const url = new URL(request.url)
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))

    const yearParam   = url.searchParams.get('year')
    const monthParam  = url.searchParams.get('month')
    const fromParam   = url.searchParams.get('from')
    const toParam     = url.searchParams.get('to')
    const userIdParam = url.searchParams.get('user_id')
    const alertParam  = url.searchParams.get('alert')
    const page  = parseInt(url.searchParams.get('page')  ?? '1')
    const limit = parseInt(url.searchParams.get('limit') ?? '50')

    let from: string
    let to: string
    if (fromParam && toParam) {
      from = fromParam
      to   = toParam
    } else {
      const y = yearParam  ? parseInt(yearParam)  : now.getFullYear()
      const m = monthParam ? parseInt(monthParam) : now.getMonth() + 1
      from = `${y}-${String(m).padStart(2, '0')}-01`
      const lastDay = new Date(y, m, 0).getDate()
      to   = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    }

    let usersQuery = db.select('users', 'id, employee_code, name').eq('is_active', true)
    if (userIdParam) usersQuery = usersQuery.eq('id', userIdParam)
    const { data: users } = await usersQuery.order('employee_code', { ascending: true })

    const { data: records } = await db
      .select('attendance_records')
      .gte('work_date', from)
      .lte('work_date', to)

    const typedUsers   = (users   ?? []) as unknown as UserRow[]
    const typedRecords = (records ?? []) as unknown as AttendanceRecord[]

    const aggregated = typedUsers.map((user) => {
      const userRecords = typedRecords.filter((r) => r.user_id === user.id)
      const total_days       = userRecords.filter((r) => r.status === 'present').length
      const total_minutes    = userRecords.reduce((s, r) => s + (r.actual_minutes   ?? 0), 0)
      const overtime_minutes = userRecords.reduce((s, r) => s + (r.overtime_minutes ?? 0), 0)
      const night_minutes    = userRecords.reduce((s, r) => s + r.night_minutes, 0)
      const holiday_work_days = userRecords.filter((r) => r.is_holiday_work).length
      const leave_days       = userRecords.filter((r) => r.status === 'leave_paid').length
      return {
        id: user.id,
        employee_code: user.employee_code,
        name: user.name,
        total_days,
        total_minutes,
        overtime_minutes,
        night_minutes,
        holiday_work_days,
        leave_days,
        closing_status: 'not_requested' as string, // Phase 2b で monthly_closings 実装後に更新
      }
    })

    let filtered = aggregated
    if (alertParam === 'overtime45') {
      filtered = filtered.filter((u) => u.overtime_minutes > 45 * 60)
    } else if (alertParam === 'overtime36') {
      filtered = filtered.filter((u) => u.overtime_minutes > 36 * 60)
    }

    const total_count = filtered.length
    const offset = (page - 1) * limit
    const paged = filtered.slice(offset, offset + limit)

    return NextResponse.json({ users: paged, total_count, period: { from, to } })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
