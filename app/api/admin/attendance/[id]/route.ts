import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import { writeAuditLog } from '@/lib/audit/log'
import type { ApiError, AttendanceRecord } from '@/lib/types'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json() as {
      clock_in?: string
      clock_out?: string | null
      break_minutes?: number
      reason: string
    }

    if (!body.reason?.trim()) {
      return NextResponse.json<ApiError>(
        { error: '修正理由を入力してください' },
        { status: 400 }
      )
    }
    if (!body.clock_in) {
      return NextResponse.json<ApiError>(
        { error: '出勤時刻は必須です' },
        { status: 400 }
      )
    }
    if (body.clock_out && body.clock_out <= body.clock_in) {
      return NextResponse.json<ApiError>(
        { error: '退勤時刻は出勤時刻より後にしてください' },
        { status: 400 }
      )
    }

    const db = withCompany(payload.company_id)

    const { data: existing } = await db
      .select('attendance_records')
      .eq('id', id)
      .single()

    if (!existing) {
      return NextResponse.json<ApiError>({ error: '打刻記録が見つかりません' }, { status: 404 })
    }

    const typedExisting = existing as unknown as AttendanceRecord

    let actualMinutes: number | null = null
    if (body.clock_out) {
      const breakMin = body.break_minutes ?? typedExisting.break_minutes
      actualMinutes = Math.max(
        0,
        Math.floor(
          (new Date(body.clock_out).getTime() - new Date(body.clock_in).getTime()) / 60000
        ) - breakMin
      )
    }

    let overtimeMinutes: number | null = null
    if (actualMinutes !== null) {
      const { data: workRule } = await db.select('work_rules', 'work_hours_per_day').single()
      const scheduledMin = Math.round(
        ((workRule as unknown as { work_hours_per_day: number } | null)?.work_hours_per_day ?? 8) * 60
      )
      overtimeMinutes = Math.max(0, actualMinutes - scheduledMin)
    }

    const updateData: Record<string, unknown> = {
      clock_in:     body.clock_in,
      clock_out:    body.clock_out ?? null,
      break_minutes: body.break_minutes ?? typedExisting.break_minutes,
    }
    if (actualMinutes  !== null) updateData.actual_minutes   = actualMinutes
    if (overtimeMinutes !== null) updateData.overtime_minutes = overtimeMinutes

    const { error: updateError } = await db
      .update('attendance_records', updateData)
      .eq('id', id)

    if (updateError) {
      return NextResponse.json<ApiError>({ error: '更新に失敗しました' }, { status: 500 })
    }

    await writeAuditLog({
      company_id: payload.company_id,
      user_id: payload.user_id,
      action: 'admin_attendance_edit',
      table_name: 'attendance_records',
      record_id: id,
      old_values: {
        clock_in:      typedExisting.clock_in,
        clock_out:     typedExisting.clock_out,
        break_minutes: typedExisting.break_minutes,
      },
      new_values: { ...updateData, reason: body.reason },
      ip_address: request.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
