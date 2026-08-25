# 重機保全台帳（Supabase接続版）

管理番号ごとの重機を登録し、整備記録を積み重ねる台帳アプリ。
Supabase（Postgres + 認証）をバックエンドにしているため、**同じログイン情報でどの端末（iOS / Android / PC）からでもログインでき、同じデータが見えます。**

設計の詳細は、このプロジェクトと一緒に渡された `juki-hozen-backend-plan.md` を参照してください。

---

## 1. Supabase プロジェクトを作成する

1. [supabase.com](https://supabase.com) で無料アカウントを作成し、新規プロジェクトを作成する。
2. プロジェクト作成後、左メニューの **SQL Editor** を開き、このプロジェクト内の `supabase/schema.sql` の中身を貼り付けて実行する。
   - `machines` `maintenance_records` `master_options` `master_content` `profiles` の各テーブルと、Row Level Security（自分のデータしか見えない設定）が作成されます。
3. 左メニューの **Authentication → Providers** で「Email」が有効になっていることを確認する（デフォルトで有効なはずです）。
4. **Authentication → URL Configuration** で、以下を設定する（開発中は localhost、本番は実際に公開するドメインに置き換えてください）。
   - Site URL: `http://localhost:5173`（本番デプロイ後は公開URLに変更）
   - Redirect URLs に `http://localhost:5173/reset-password` と、本番URLの `/reset-password` を追加
5. **Project Settings → API** から、`Project URL` と `anon public` キーをコピーする（次の手順で使います）。

## 2. ローカルで動かす

```bash
npm install
cp .env.example .env
# .env を開いて、手順1でコピーした URL と anon key を貼り付ける

npm run dev
```

`http://localhost:5173` を開くと、ログイン画面が表示されます。
「初めての方はこちら（新規登録）」からメールアドレスとパスワードでアカウントを作成すると、そのままログインできます。

## 3. 本番公開（Vercel の例）

```bash
npm run build
```

もしくは GitHub にプッシュして [vercel.com](https://vercel.com) でリポジトリをインポートするだけでもデプロイできます。

デプロイ時、Vercel のプロジェクト設定 → Environment Variables に、`.env` と同じ内容
（`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`）を追加してください。

デプロイ後に発行される公開URL（例：`https://juki-hozen.vercel.app`）を、
Supabase の **Authentication → URL Configuration** の Site URL / Redirect URLs にも追加するのを忘れないでください
（これを忘れると、パスワード再設定メールのリンクが正しく機能しません）。

## 4. 複数端末で使う

デプロイ後の公開URLに、iPhone・Android・PCのどのブラウザからアクセスしても、
同じメールアドレス・パスワードでログインすれば同じデータが見えます。
スマホでは「ホーム画面に追加」をしておくと、アプリのようにアイコンから起動できます。

## 5. 追加された機能

- **整備履歴の編集**：機械の詳細画面で、各整備記録の右上にある「編集」ボタンから内容を修正できます。
- **登録済み機械の削除**：「⚙ マスタ編集」ページに「登録済み機械の削除」カードがあります。削除すると、その機械の整備記録もあわせて削除されます（データベース側の `ON DELETE CASCADE` により自動的に処理されます）。
- **メーカーごとのグループ表示**：一覧画面はメーカーごとに見出しを立てて表示されます。管理番号・機種・メーカーの絞り込みと組み合わせて使えます。

---

## ディレクトリ構成

```
├── index.html
├── vite.config.js
├── vercel.json              # SPAルーティング用（/reset-password 対応）
├── .env.example
├── supabase/
│   └── schema.sql           # Supabase SQL Editor で実行するスキーマ一式
└── src/
    ├── main.jsx              # エントリーポイント
    ├── App.jsx                # 認証状態の監視 / 画面切り替え
    ├── supabaseClient.js       # Supabaseクライアント初期化
    ├── api.js                  # 認証・CRUDのラッパー関数
    ├── styles.css               # 全スタイル（藍色・和紙・ハンコの意匠）
    └── components/
        ├── ui.jsx                # 共通UI部品（Hanko, Field, EditableSelectなど）
        ├── Auth.jsx               # ログイン・新規登録・パスワード再発行画面
        └── Ledger.jsx              # 台帳本体（一覧・詳細・マスタ編集）
```

## 既知の制約・今後の拡張余地

- 現状は1ユーザー＝1台帳（`owner_id` で分離）です。会社やチームで台帳を共有したい場合は、
  `organizations` テーブルを追加して `machines.owner_id` の代わりに `organization_id` で紐付ける設計に拡張してください。
- ネイティブのiOS/Androidアプリ（App Store / Google Play配信）にしたい場合は、
  このWebアプリをベースに [Capacitor](https://capacitorjs.com/) でラップする追加作業が必要です。
  まずはWeb版で複数端末対応ができているか確認してから検討することをおすすめします。
