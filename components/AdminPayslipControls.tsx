'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props { year: number; month: number }

export function AdminPayslipControls({ year, month }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function generate() {
    if (!confirm(`${year}年${month}月の給与明細を生成（再生成）しますか？`)) return
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/admin/payslips/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month }),
      })
      const body = await res.json()
      if (!res.ok) { setMessage(body.error ?? '生成に失敗しました'); return }
      setMessage(`${body.generated}名分の給与明細を生成しました`)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={generate}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? '生成中...' : `${year}年${month}月 給与明細を生成`}
      </button>
      {message && <p className="text-sm text-green-600">{message}</p>}
    </div>
  )
}

export default AdminPayslipControls
