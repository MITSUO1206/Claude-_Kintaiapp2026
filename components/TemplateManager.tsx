'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PayslipTemplate, PayslipItemCategory } from '@/lib/types'

const CATEGORIES: { key: PayslipItemCategory; label: string }[] = [
  { key: 'income', label: '支給' },
  { key: 'deduction', label: '控除' },
  { key: 'adjustment', label: '調整' },
]

export function TemplateManager({ initialTemplates }: { initialTemplates: PayslipTemplate[] }) {
  const router = useRouter()
  const [templates, setTemplates] = useState(initialTemplates)
  const [newLabel, setNewLabel] = useState('')
  const [newCategory, setNewCategory] = useState<PayslipItemCategory>('income')
  const [newAmount, setNewAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function addTemplate() {
    if (!newLabel.trim()) { setError('項目名を入力してください'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/payslip-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: newCategory,
          label: newLabel.trim(),
          default_amount: newAmount ? parseFloat(newAmount) : null,
          sort_order: templates.filter((t) => t.category === newCategory).length,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'エラーが発生しました')
        return
      }
      const data = await res.json()
      setTemplates((prev) => [...prev, data.template])
      setNewLabel('')
      setNewAmount('')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm('このテンプレートを削除しますか？')) return
    await fetch(`/api/admin/payslip-templates/${id}`, { method: 'DELETE' })
    setTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  return (
    <div className="space-y-4">
      {CATEGORIES.map(({ key, label }) => (
        <Card key={key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{label}項目テンプレート</CardTitle>
          </CardHeader>
          <CardContent>
            {templates.filter((t) => t.category === key).length === 0 ? (
              <p className="text-xs text-gray-400">テンプレートなし</p>
            ) : (
              <ul className="space-y-1">
                {templates.filter((t) => t.category === key).map((t) => (
                  <li key={t.id} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <span>{t.label}</span>
                    <div className="flex items-center gap-2">
                      {t.default_amount != null && (
                        <span className="text-gray-400 text-xs">¥{t.default_amount.toLocaleString()}</span>
                      )}
                      <button
                        onClick={() => deleteTemplate(t.id)}
                        className="text-xs text-red-400 hover:text-red-600"
                        type="button"
                      >
                        削除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">テンプレートを追加</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>カテゴリ</Label>
            <div className="flex gap-2 mt-1">
              {CATEGORIES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setNewCategory(key)}
                  className={`text-xs px-3 py-1 rounded-full border ${newCategory === key ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>項目名</Label>
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="例: 役職手当" />
          </div>
          <div>
            <Label>デフォルト金額（任意）</Label>
            <Input type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0" />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button onClick={addTemplate} disabled={loading} size="sm">
            {loading ? '追加中...' : '追加'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
