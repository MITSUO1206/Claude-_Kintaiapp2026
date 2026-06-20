import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError, WorkRulePattern } from '@/lib/types'

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: '権限がありません' }, { status: 403 })
    }

    const db = withCompany(payload.company_id)
    const { data, error } = await db
      .select('work_rule_patterns', '*')
      .order('is_default', { ascending: false })

    if (error) {
      return NextResponse.json<ApiError>({ error: 'データ取得に失敗しました' }, { status: 500 })
    }

    // 各パターンを使用している社員数を取得
    const patterns = (data ?? []) as unknown as WorkRulePattern[]
    const patternIds = patterns.map((p) => p.id)

    let countMap = new Map<string, number>()
    if (patternIds.length > 0) {
      const { data: users } = await db
        .select('users', 'work_rule_pattern_id')
        .eq('is_active', true)

      type U = { work_rule_pattern_id: string | null }
      for (const u of ((users ?? []) as unknown as U[])) {
        if (u.work_rule_pattern_id) {
          countMap.set(u.work_rule_pattern_id, (countMap.get(u.work_rule_pattern_id) ?? 0) + 1)
        }
      }
    }

    const result = patterns.map((p) => ({ ...p, user_count: countMap.get(p.id) ?? 0 }))

    return NextResponse.json({ patterns: result })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

const ALLOWED_FIELDS = ['name', 'start_time', 'end_time', 'break_minutes', 'work_hours_per_day', 'work_days_per_month', 'is_night_shift', 'is_default'] as const

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }

    const body = await request.json() as Record<string, unknown>
    const db   = withCompany(payload.company_id)

    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json<ApiError>({ error: 'パターン名は必須です' }, { status: 400 })
    }

    const data: Record<string, unknown> = {}
    for (const key of ALLOWED_FIELDS) {
      if (key in body) data[key] = body[key]
    }
    data.name = String(body.name).trim()

    // is_default=true にする場合は既存のデフォルトを解除
    if (data.is_default) {
      await db.update('work_rule_patterns', { is_default: false }).eq('is_default', true)
    }

    const { data: inserted, error } = await db.insert('work_rule_patterns', data)
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json<ApiError>({ error: 'そのパターン名はすでに存在します' }, { status: 409 })
      }
      return NextResponse.json<ApiError>({ error: '作成に失敗しました' }, { status: 500 })
    }

    const pattern = (Array.isArray(inserted) ? inserted[0] : inserted) as unknown as WorkRulePattern
    return NextResponse.json({ pattern }, { status: 201 })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
