'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  userId: string
  isActive: boolean
  isSelf: boolean
}

export function AdminUserActions({ userId, isActive, isSelf }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function deactivate() {
    if (!confirm('この社員を退職にしますか？')) return
    setLoading(true)
    try {
      await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function reactivate() {
    setLoading(true)
    try {
      await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: true }),
      })
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function resetPassword() {
    if (!confirm('仮パスワードを発行しますか？')) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${userId}/reset-password`, { method: 'POST' })
      const body = await res.json()
      alert(body.message ?? '送信しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <a href={`/admin/users/${userId}/edit`} className="text-xs text-blue-500 hover:underline px-1">編集</a>
      <button onClick={resetPassword} disabled={loading} className="text-xs text-gray-500 hover:underline px-1">PW再発行</button>
      {!isSelf && isActive && (
        <button onClick={deactivate} disabled={loading} className="text-xs text-red-400 hover:underline px-1">退職</button>
      )}
      {!isActive && (
        <button onClick={reactivate} disabled={loading} className="text-xs text-green-500 hover:underline px-1">在籍に戻す</button>
      )}
    </div>
  )
}

export default AdminUserActions
