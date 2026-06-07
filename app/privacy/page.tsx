export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3">
        <a href="/" className="font-bold text-blue-600 text-lg">KintaiApp</a>
      </header>
      <main className="max-w-2xl mx-auto p-6 space-y-6 text-sm text-gray-700">
        <h1 className="text-2xl font-bold text-gray-900">プライバシーポリシー</h1>
        <p className="text-gray-400 text-xs">最終更新日: 2026年6月6日</p>

        <section>
          <h2 className="font-bold mb-2">1. 取得する情報</h2>
          <p>本サービスは以下の情報を取得します。</p>
          <ul className="list-disc ml-4 space-y-1 mt-2">
            <li>氏名・社員番号・メールアドレス等の基本情報</li>
            <li>勤怠打刻情報（出退勤時刻・休憩時間）</li>
            <li>給与・賃金に関する情報</li>
            <li>アクセスログ・操作ログ</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold mb-2">2. 利用目的</h2>
          <ul className="list-disc ml-4 space-y-1">
            <li>勤怠管理・給与計算サービスの提供</li>
            <li>本サービスの改善・運営</li>
            <li>法令上の義務の履行</li>
          </ul>
        </section>

        <section>
          <h2 className="font-bold mb-2">3. 第三者提供</h2>
          <p>法令に基づく場合を除き、あらかじめユーザーの同意を得ることなく、第三者に個人情報を提供することはありません。</p>
        </section>

        <section>
          <h2 className="font-bold mb-2">4. 安全管理</h2>
          <p>個人情報の漏洩・滅失・毀損の防止のため、適切なセキュリティ対策を実施します。パスワードはbcryptによりハッシュ化して保存し、通信はHTTPS（TLS）で保護します。</p>
        </section>

        <section>
          <h2 className="font-bold mb-2">5. お問い合わせ</h2>
          <p>個人情報の取扱いに関するお問い合わせは、各企業の管理者までご連絡ください。</p>
        </section>

        <div className="pt-4 border-t">
          <a href="/" className="text-blue-500 hover:underline text-sm">← トップに戻る</a>
        </div>
      </main>
    </div>
  )
}
