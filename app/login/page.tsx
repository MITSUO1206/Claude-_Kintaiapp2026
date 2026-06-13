'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default function LoginPage() {
  const router = useRouter()
  const [form, setForm] = useState({ company_code: '', employee_code: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isValid = form.company_code && form.employee_code && form.password

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'ログインに失敗しました')
        return
      }

      if (data.user.force_password_change) {
        router.push('/change-password')
      } else if (data.user.role === 'admin' || data.user.role === 'manager') {
        router.push('/admin')
      } else {
        router.push('/dashboard')
      }
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-blue-600">KintaiApp</CardTitle>
          <CardDescription>勤怠・給与管理システム</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_code">会社 ID</Label>
              <Input
                id="company_code"
                placeholder="例: ACME-001"
                value={form.company_code}
                onChange={(e) => setForm({ ...form, company_code: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employee_code">ユーザー ID（社員番号）</Label>
              <Input
                id="employee_code"
                placeholder="例: EMP-0001"
                value={form.employee_code}
                onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={!isValid || loading}>
              {loading ? 'ログイン中...' : 'ログイン'}
            </Button>
            <p className="text-center text-sm">
              <a href="/forgot-password" className="text-blue-500 hover:underline text-xs">
                パスワードを忘れた場合
              </a>
            </p>
          </form>
          <p className="text-xs text-gray-400 text-center mt-4">
            ※ 管理者から配布された会社IDと社員番号でログイン
          </p>
          <div className="text-xs text-gray-400 text-center mt-2 flex justify-center gap-3">
            <a href="/terms" className="hover:underline">利用規約</a>
            <a href="/privacy" className="hover:underline">プライバシーポリシー</a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
