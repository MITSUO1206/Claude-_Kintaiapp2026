import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { withCompany } from '@/lib/db/withCompany'

const DEFAULTS = ['0800-1645', '0900-1745', '休日', '年休']

export async function GET(request: NextRequest) {
  try {
    const payload = await requireAuth(request)
    const db = withCompany(payload.company_id)

    const { data } = await db
      .select('shift_types', 'id, label, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    const labels = (data ?? []) as { id: string; label: string; sort_order: number }[]
    return NextResponse.json({
      shift_types: labels.length > 0 ? labels.map((r) => r.label) : DEFAULTS,
    })
  } catch {
    return NextResponse.json({ shift_types: DEFAULTS })
  }
}
