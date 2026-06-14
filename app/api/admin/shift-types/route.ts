import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'
import type { ApiError } from '@/lib/types'

type ShiftRow = { id: string; label: string; sort_order: number; is_active: boolean }

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin' && payload.role !== 'manager') {
      return NextResponse.json<ApiError>({ error: 'Forbidden' }, { status: 403 })
    }
    const db = withCompany(payload.company_id)
    const { data } = await db
      .select('shift_types', 'id, label, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    return NextResponse.json({ shift_types: (data ?? []) as ShiftRow[] })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    if (payload.role !== 'admin') {
      return NextResponse.json<ApiError>({ error: '管理者のみ操作可能です' }, { status: 403 })
    }
    const { label } = await request.json() as { label?: string }
    if (!label?.trim()) {
      return NextResponse.json<ApiError>({ error: 'パターン名を入力してください' }, { status: 400 })
    }

    const db = withCompany(payload.company_id)

    // 最大 sort_order を取得
    const { data: existing } = await db
      .select('shift_types', 'sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: false })

    const rows = (existing ?? []) as { sort_order: number }[]
    const nextOrder = rows.length > 0 ? rows[0].sort_order + 1 : 0

    const { error } = await db.insert('shift_types', {
      label: label.trim(),
      sort_order: nextOrder,
      is_active: true,
    })

    if (error) {
      const msg = (error as { message?: string }).message ?? ''
      if (msg.includes('unique') || msg.includes('duplicate')) {
        return NextResponse.json<ApiError>({ error: '同じパターンが既に存在します' }, { status: 409 })
      }
      return NextResponse.json<ApiError>({ error: '作成に失敗しました' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json<ApiError>({ error: 'Unauthorized' }, { status: 401 })
  }
}
