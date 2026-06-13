'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export default function ForgotPasswordPage() {
  const [form, setForm] = useState({ company_code: '', employee_code: '' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [requireAdmin, setRequireAdmin] = useState(false)
  const [error, setError] = useState('')

  const isValid = form.company_code.trim() && form.employee_code.trim()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'エラーが発生しました')
        return
      }
      setRequireAdmin(data.requireAdmin === true)
      setDone(true)
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
          <CardTitle className="text-2xl font-bold text-blue-600">KintaiApp</CardTitle>
          <CardDescription>パスワードの再設定</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="space-y-4 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              {requireAdmin ? (
                <>
                  <p className="text-gray-700 font-medium">管理者にお問い合わせください</p>
                  <p className="text-sm text-gray-500">
                    メール通知が設定されていないため、パスワードのリセットは管理者が行います。<br />
                    管理者にパスワードリセットを依頼してください。
                  </p>
                </>
              ) : (
                <>
                  <p className="text-gray-700 font-medium">メールを送信しました</p>
                  <p className="text-sm text-gray-500">
                    登録済みのメールアドレスに仮パスワードを送りました。<br />
                    メールを確認してログインしてください。
                  </p>
                </>
              )}
              <p className="text-xs text-gray-400">
                ※ 問題が解決しない場合は管理者にお問い合わせください
              </p>
              <a
                href="/login"
                className="inline-block mt-2 text-sm text-blue-600 hover:underline"
              >
                ログイン画面に戻る
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-500 mb-2">
                会社IDと社員番号を入力してください。登録済みのメールアドレスに仮パスワードを送信します。
              </p>
              <div className="space-y-2">
                <Label htmlFor="company_code">会社ID</Label>
                <Input
                  id="company_code"
                  placeholder="例: ACME-001"
                  value={form.company_code}
                  onChange={(e) => setForm({ ...form, company_code: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee_code">社員番号</Label>
                <Input
                  id="employee_code"
                  placeholder="例: EMP-0001"
                  value={form.employee_code}
                  onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
                />
              </div>
              {error && (
                <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={!isValid || loading}>
                {loading ? '送信中...' : '仮パスワードを送信'}
              </Button>
              <p className="text-center text-sm">
                <a href="/login" className="text-blue-600 hover:underline">ログイン画面に戻る</a>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
