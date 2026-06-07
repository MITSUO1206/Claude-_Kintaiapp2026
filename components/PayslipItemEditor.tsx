'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PayslipItem, PayslipItemCategory } from '@/lib/types'

type EditItem = {
  id?: string
  category: PayslipItemCategory
  label: string
  amount: string
  note: string
  sort_order: number
  is_auto_calc: boolean
}

function itemsToEdit(items: PayslipItem[]): EditItem[] {
  return items.map((item) => ({
    id: item.id,
    category: item.category,
    label: item.label,
    amount: String(item.amount),
    note: item.note ?? '',
    sort_order: item.sort_order,
    is_auto_calc: item.is_auto_calc,
  }))
}

function calcTotals(items: EditItem[]) {
  const income = items.filter((i) => i.category === 'income').reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
  const deduction = items.filter((i) => i.category === 'deduction').reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
  const adjustment = items.filter((i) => i.category === 'adjustment').reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
  return { income, deduction, adjustment, net: income + adjustment - deduction }
}

function yen(v: number) { return `¥${Math.round(v).toLocaleString()}` }

export function PayslipItemEditor({
  payslipId,
  initialItems,
  isPublished,
  year,
  month,
}: {
  payslipId: string
  initialItems: PayslipItem[]
  isPublished: boolean
  year: number
  month: number
}) {
  const router = useRouter()
  const [items, setItems] = useState<EditItem[]>(itemsToEdit(initialItems))
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  function updateItem(idx: number, field: keyof EditItem, value: string | boolean | number) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function addItem(category: PayslipItemCategory) {
    const maxOrder = items.filter((i) => i.category === category).reduce((m, i) => Math.max(m, i.sort_order), 0)
    setItems((prev) => [...prev, { category, label: '', amount: '0', note: '', sort_order: maxOrder + 1, is_auto_calc: false }])
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    try {
      const payload = items.map((item, i) => ({
        ...item,
        amount: parseFloat(item.amount) || 0,
        sort_order: i,
      }))
      const res = await fetch(`/api/admin/payslips/${payslipId}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? '保存に失敗しました')
        return
      }
      setMsg('保存しました')
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    if (!confirm(`${year}年${month}月の給与明細を公開しますか？公開後は編集できません。`)) return
    setPublishing(true)
    setError('')
    try {
      // 先に保存
      const payload = items.map((item, i) => ({
        ...item,
        amount: parseFloat(item.amount) || 0,
        sort_order: i,
      }))
      await fetch(`/api/admin/payslips/${payslipId}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      })
      const res = await fetch(`/api/admin/payslips/${payslipId}/publish`, { method: 'PATCH' })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? '公開に失敗しました')
        return
      }
      router.push('/admin/payslips')
    } finally {
      setPublishing(false)
    }
  }

  async function handleDelete() {
    if (!confirm('この給与明細を削除しますか？')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/payslips/${payslipId}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? '削除に失敗しました')
        return
      }
      router.push('/admin/payslips')
    } finally {
      setDeleting(false)
    }
  }

  const totals = calcTotals(items)

  const categories: { key: PayslipItemCategory; label: string; color: string }[] = [
    { key: 'income', label: '支給', color: 'text-blue-700' },
    { key: 'deduction', label: '控除', color: 'text-red-600' },
    { key: 'adjustment', label: '調整', color: 'text-orange-600' },
  ]

  return (
    <div className="space-y-4">
      {categories.map(({ key, label, color }) => (
        <Card key={key}>
          <CardHeader className="pb-2">
            <CardTitle className={`text-sm ${color}`}>{label}項目</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.filter((item) => item.category === key).map((item, globalIdx) => {
              const idx = items.findIndex((i) => i === item)
              return (
                <div key={globalIdx} className="flex gap-2 items-center">
                  <Input
                    value={item.label}
                    onChange={(e) => updateItem(idx, 'label', e.target.value)}
                    placeholder="項目名"
                    className="flex-1 text-sm"
                    disabled={isPublished}
                  />
                  <Input
                    type="number"
                    value={item.amount}
                    onChange={(e) => updateItem(idx, 'amount', e.target.value)}
                    placeholder="金額"
                    className="w-32 text-sm text-right"
                    disabled={isPublished}
                  />
                  <Input
                    value={item.note}
                    onChange={(e) => updateItem(idx, 'note', e.target.value)}
                    placeholder="備考"
                    className="w-32 text-sm"
                    disabled={isPublished}
                  />
                  {!isPublished && (
                    <button
                      onClick={() => removeItem(idx)}
                      className="text-gray-400 hover:text-red-500 text-sm px-1"
                      type="button"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
            {!isPublished && (
              <button
                onClick={() => addItem(key)}
                className="text-xs text-blue-500 hover:underline mt-1"
                type="button"
              >
                + {label}項目を追加
              </button>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-gray-500">総支給額</span>
            <span className="text-right font-bold text-blue-700">{yen(totals.income + totals.adjustment)}</span>
            <span className="text-gray-500">控除合計</span>
            <span className="text-right font-bold text-red-600">-{yen(totals.deduction)}</span>
            <span className="text-gray-500 font-semibold border-t pt-2">差引支給額</span>
            <span className={`text-right font-bold border-t pt-2 ${totals.net < 0 ? 'text-red-600' : 'text-green-700'}`}>{yen(totals.net)}</span>
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {msg && <p className="text-sm text-green-600">{msg}</p>}

      {!isPublished && (
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleSave} disabled={saving} variant="outline">
            {saving ? '保存中...' : '下書き保存'}
          </Button>
          <Button onClick={handlePublish} disabled={publishing} className="bg-green-600 hover:bg-green-700">
            {publishing ? '公開中...' : '公開する（社員に通知）'}
          </Button>
          <Button onClick={handleDelete} disabled={deleting} variant="destructive" className="ml-auto">
            {deleting ? '削除中...' : '削除'}
          </Button>
        </div>
      )}
    </div>
  )
}
