'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<'identify' | 'reset' | 'done'>('identify')
  const [form, setForm] = useState({ company_code: '', employee_code: '' })
  const [passwords, setPasswords] = useState({ new_password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isIdentifyValid = form.company_code.trim() && form.employee_code.trim()
  const isResetValid =
    passwords.new_password.length >= 8 && passwords.new_password === passwords.confirm

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!isIdentifyValid) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, action: 'verify' }),
      })
      const data = await res.json() as { ok?: boolean; verified?: boolean; error?: string }
      if (!res.ok) { setError(data.error ?? 'エラーが発生しました'); return }
      if (data.verified) {
        setStep('reset')
      } else {
        setError('会社IDまたは社員番号が正しくありません')
      }
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!isResetValid) return
    if (passwords.new_password !== passwords.confirm) {
      setError('パスワードが一致しません')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, action: 'reset', new_password: passwords.new_password }),
      })
      const data = await res.json() as { ok?: boolean; reset?: boolean; error?: string }
      if (!res.ok) { setError(data.error ?? 'エラーが発生しました'); return }
      setStep('done')
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
          {step === 'done' && (
            <div className="space-y-4 text-center">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-gray-700 font-medium">パスワードを更新しました</p>
              <p className="text-sm text-gray-500">新しいパスワードでログインしてください。</p>
              <a href="/login" className="inline-block mt-2 text-sm text-blue-600 hover:underline">
                ログイン画面へ
              </a>
            </div>
          )}

          {step === 'identify' && (
            <form onSubmit={handleVerify} className="space-y-4">
              <p className="text-sm text-gray-500 mb-2">
                会社IDと社員番号を入力してください。
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
              {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
              <Button type="submit" className="w-full" disabled={!isIdentifyValid || loading}>
                {loading ? '確認中...' : '次へ'}
              </Button>
              <p className="text-center text-sm">
                <a href="/login" className="text-blue-600 hover:underline">ログイン画面に戻る</a>
              </p>
            </form>
          )}

          {step === 'reset' && (
            <form onSubmit={handleReset} className="space-y-4">
              <p className="text-sm text-gray-500 mb-2">
                新しいパスワードを設定してください（8文字以上）。
              </p>
              <div className="space-y-2">
                <Label htmlFor="new_password">新しいパスワード</Label>
                <Input
                  id="new_password"
                  type="password"
                  placeholder="8文字以上"
                  value={passwords.new_password}
                  onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">パスワード確認</Label>
                <Input
                  id="confirm"
                  type="password"
                  placeholder="もう一度入力"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                />
                {passwords.confirm && passwords.new_password !== passwords.confirm && (
                  <p className="text-xs text-red-500">パスワードが一致しません</p>
                )}
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
              <Button type="submit" className="w-full" disabled={!isResetValid || loading}>
                {loading ? '更新中...' : 'パスワードを設定する'}
              </Button>
              <button
                type="button"
                onClick={() => { setStep('identify'); setError('') }}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-600"
              >
                ← 入力し直す
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
