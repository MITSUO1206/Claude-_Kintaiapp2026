'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  year: number
  month: number
  userIds: string[]
}

export function RemindButton({ year, month, userIds }: Props) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleRemind() {
    setLoading(true)
    try {
      await fetch('/api/admin/attendance/remind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, user_ids: userIds }),
      })
      setDone(true)
    } finally {
      setLoading(false)
    }
  }

  if (done) return <span className="text-xs text-green-600">催促メール送信済み</span>

  return (
    <Button
      size="sm"
      variant="outline"
      className="text-xs border-yellow-400 text-yellow-700 hover:bg-yellow-100 h-7"
      onClick={handleRemind}
      disabled={loading}
    >
      {loading ? '送信中...' : '催促メール送信'}
    </Button>
  )
}
