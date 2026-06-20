import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError } from '@/lib/types'

const ALLOWED_FIELDS = ['name', 'start_time', 'end_time', 'break_minutes', 'work_hours_per_day', 'work_days_per_month', 'is_night_shift', 'is_default'] as const

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }

    const { id } = await params
    const body = await request.json() as Record<string, unknown>
    const db   = withCompany(payload.company_id)

    const updates: Record<string, unknown> = {}
    for (const key of ALLOWED_FIELDS) {
      if (key in body) updates[key] = body[key]
    }
    if (body.name) updates.name = String(body.name).trim()

    if (Object.keys(updates).length === 0) {
      return NextResponse.json<ApiError>({ error: '更新項目がありません' }, { status: 400 })
    }

    // is_default=true にする場合は既存のデフォルトを解除
    if (updates.is_default) {
      await db.update('work_rule_patterns', { is_default: false }).eq('is_default', true)
    }

    const { error } = await db.update('work_rule_patterns', updates).eq('id', id)
    if (error) {
      return NextResponse.json<ApiError>({ error: '更新に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }

    const { id } = await params
    const db = withCompany(payload.company_id)

    // 使用中の社員がいれば削除不可
    const { data: usersOnPattern } = await db
      .select('users', 'id')
      .eq('work_rule_pattern_id', id)
      .eq('is_active', true)

    if ((usersOnPattern ?? []).length > 0) {
      return NextResponse.json<ApiError>(
        { error: 'このパターンを使用している社員がいます。先に社員のパターンを変更してください。' },
        { status: 409 }
      )
    }

    // デフォルトパターンは削除不可
    const { data: pattern } = await db
      .select('work_rule_patterns', 'is_default')
      .eq('id', id)
      .single()

    type P = { is_default: boolean }
    if ((pattern as unknown as P | null)?.is_default) {
      return NextResponse.json<ApiError>(
        { error: 'デフォルトパターンは削除できません。先に別のパターンをデフォルトに設定してください。' },
        { status: 409 }
      )
    }

    const { error } = await db.delete('work_rule_patterns').eq('id', id)
    if (error) {
      return NextResponse.json<ApiError>({ error: '削除に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
