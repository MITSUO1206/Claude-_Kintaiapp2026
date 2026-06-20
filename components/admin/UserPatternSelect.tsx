'use client'

import { useState } from 'react'
import type { WorkRulePattern } from '@/lib/types'

interface Props {
  userId: string
  currentPatternId: string | null
  patterns: Pick<WorkRulePattern, 'id' | 'name' | 'is_default'>[]
}

export function UserPatternSelect({ userId, currentPatternId, patterns }: Props) {
  const [selected, setSelected] = useState(currentPatternId ?? '')
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)

  async function handleChange(patternId: string) {
    setSaving(true)
    setSaved(false)
    const value = patternId === '' ? null : patternId
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ work_rule_pattern_id: value }),
      })
      if (res.ok) {
        setSelected(patternId)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  const defaultPattern = patterns.find((p) => p.is_default)

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={selected}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className="border rounded px-2 py-1 text-xs text-gray-700 bg-white disabled:opacity-50 max-w-[160px]"
      >
        <option value="">
          {defaultPattern ? `${defaultPattern.name}（デフォルト）` : 'デフォルト'}
        </option>
        {patterns.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}{p.is_default ? '（既定）' : ''}
          </option>
        ))}
      </select>
      {saved && <span className="text-xs text-green-500">✓</span>}
    </div>
  )
}
