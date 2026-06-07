export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3">
        <a href="/" className="font-bold text-blue-600 text-lg">KintaiApp</a>
      </header>
      <main className="max-w-2xl mx-auto p-6 space-y-6 text-sm text-gray-700">
        <h1 className="text-2xl font-bold text-gray-900">利用規約</h1>
        <p className="text-gray-400 text-xs">最終更新日: 2026年6月6日</p>

        <section>
          <h2 className="font-bold mb-2">第1条（適用）</h2>
          <p>本規約は、KintaiApp（以下「本サービス」）の利用に関し、利用者と運営者との間の権利義務関係を定めることを目的とし、利用者と運営者との間の本サービスの利用に関わる一切の関係に適用されます。</p>
        </section>

        <section>
          <h2 className="font-bold mb-2">第2条（利用登録）</h2>
          <p>本サービスは企業単位での契約を前提としており、企業管理者が従業員アカウントを作成・管理します。利用登録は企業管理者の責任のもとで行われます。</p>
        </section>

        <section>
          <h2 className="font-bold mb-2">第3条（禁止事項）</h2>
          <p>利用者は以下の行為をしてはなりません。</p>
          <ul className="list-disc ml-4 space-y-1 mt-2">
            <li>他のユーザーの情報への不正アクセス</li>
            <li>本サービスへの不正な操作・改ざん</li>
            <li>法令または公序良俗に違反する行為</li>
            <li>本サービスの運営を妨害する行為</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold mb-2">第4条（免責事項）</h2>
          <p>運営者は、本サービスに起因して利用者に生じた損害について、一切の責任を負いません。本サービスは現状有姿で提供されます。</p>
        </section>

        <section>
          <h2 className="font-bold mb-2">第5条（サービス内容の変更等）</h2>
          <p>運営者はユーザーに通知することなく、本サービスの内容を変更しまたは本サービスの提供を中止することができるものとします。</p>
        </section>

        <div className="pt-4 border-t">
          <a href="/" className="text-blue-500 hover:underline text-sm">← トップに戻る</a>
        </div>
      </main>
    </div>
  )
}
