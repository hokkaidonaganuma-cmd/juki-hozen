import React, { useState } from "react";
import { Field } from "./ui";
import * as api from "../api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-seal">検</div>
        <h1 className="login-title">{title}</h1>
        <p className="login-sub">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

export function LoginPage({ onGoRegister, onGoForgot }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e && e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.signIn({ email: email.trim(), password });
      // 成功すると onAuthStateChange 経由で App.jsx 側が自動的にログイン後の画面に切り替える
    } catch (err) {
      setError("メールアドレスまたはパスワードが正しくありません。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="重機保全台帳" subtitle="ログインしてください">
      <div className="login-form">
        <Field label="メールアドレス（ログインID）" required>
          <input
            className="input"
            autoFocus
            type="email"
            placeholder="メールアドレスを入力"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit(e)}
          />
        </Field>
        <Field label="パスワード" required>
          <div className="pw-row">
            <input
              className="input"
              type={showPw ? "text" : "password"}
              placeholder="パスワードを入力"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit(e)}
            />
            <button
              type="button"
              className="pw-toggle"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "パスワードを隠す" : "パスワードを表示"}
            >
              {showPw ? "隠す" : "表示"}
            </button>
          </div>
        </Field>
        {error && <p className="error-text">{error}</p>}
        <button type="button" className="btn btn-primary login-btn" onClick={submit} disabled={loading}>
          {loading ? "ログイン中…" : "ログイン"}
        </button>
      </div>

      <div className="auth-links">
        <button type="button" className="link-btn" onClick={onGoRegister}>
          初めての方はこちら（新規登録）
        </button>
        <button type="button" className="link-btn" onClick={onGoForgot}>
          IDとパスワードを忘れた方はこちら
        </button>
      </div>
    </AuthShell>
  );
}

export function RegisterPage({ onBackToLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    const mail = email.trim();
    if (!mail) return setError("メールアドレスを入力してください。ログインIDとして使用します。");
    if (!EMAIL_RE.test(mail)) return setError("メールアドレスの形式が正しくありません。");
    if (!password) return setError("パスワードを設定してください。");
    if (password.length < 6) return setError("パスワードは6文字以上で設定してください。");
    if (password !== confirm) return setError("パスワード（確認）が一致しません。");

    setError("");
    setLoading(true);
    try {
      await api.signUp({ email: mail, password, displayName: name.trim() });
      setDone(true);
    } catch (err) {
      setError(err.message || "登録に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="登録を受け付けました" subtitle="">
        <p className="login-hint" style={{ marginTop: 0 }}>
          確認メールを送信しました。メール内のリンクを開いて登録を完了してください
          （Supabaseプロジェクトの設定で確認メールを無効にしている場合は、そのままログインできます）。
        </p>
        <div className="auth-links">
          <button type="button" className="link-btn" onClick={onBackToLogin}>
            ログイン画面に戻る
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="新規アカウント作成" subtitle="メールアドレスがそのままログインIDになります">
      <div className="login-form">
        <Field label="メールアドレス（ログインID）" required>
          <input
            className="input"
            autoFocus
            type="email"
            placeholder="メールアドレスを入力"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="パスワード" required>
          <div className="pw-row">
            <input
              className="input"
              type={showPw ? "text" : "password"}
              placeholder="6文字以上で設定"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="pw-toggle"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "パスワードを隠す" : "パスワードを表示"}
            >
              {showPw ? "隠す" : "表示"}
            </button>
          </div>
        </Field>
        <Field label="パスワード（確認）" required>
          <input
            className="input"
            type={showPw ? "text" : "password"}
            placeholder="もう一度入力"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Field label="表示名（任意）">
          <input
            className="input"
            placeholder="未入力の場合メールアドレスの@より前を使用"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        {error && <p className="error-text">{error}</p>}
        <button type="button" className="btn btn-primary login-btn" onClick={submit} disabled={loading}>
          {loading ? "作成中…" : "アカウントを作成"}
        </button>
      </div>

      <div className="auth-links">
        <button type="button" className="link-btn" onClick={onBackToLogin}>
          ログイン画面に戻る
        </button>
      </div>

      <p className="login-hint">
        登録した内容はSupabase上のデータベースに保存され、同じメールアドレス・パスワードでどの端末からでもログインできます。
      </p>
    </AuthShell>
  );
}

export function ForgotPasswordPage({ onBack }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const mail = email.trim();
    if (!mail) return setError("メールアドレスを入力してください。");
    setError("");
    setLoading(true);
    try {
      // redirectTo: パスワード再設定リンクをクリックした後に戻ってくるURL
      // 本番では実際に公開したドメイン + "/reset-password" などに合わせて変更してください
      await api.resetPasswordForEmail(mail, `${window.location.origin}/reset-password`);
      setSent(true);
    } catch (err) {
      setError("送信に失敗しました。時間をおいて再度お試しください。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="ID・パスワードの再発行" subtitle="ご登録のメールアドレスを入力してください">
      {sent ? (
        <div className="email-preview">
          <p className="email-preview-label">送信しました</p>
          <p className="email-preview-line">
            {email} 宛にパスワード再設定用のリンクを送信しました。メールをご確認ください。
          </p>
          <p className="email-preview-note">
            ※ このメールアドレスが未登録の場合も、セキュリティのため同じ表示になります。
          </p>
        </div>
      ) : (
        <div className="login-form">
          <Field label="メールアドレス" required>
            <input
              className="input"
              autoFocus
              type="email"
              placeholder="登録済みのメールアドレス"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </Field>
          {error && <p className="error-text">{error}</p>}
          <button type="button" className="btn btn-primary login-btn" onClick={submit} disabled={loading}>
            {loading ? "送信中…" : "送信"}
          </button>
        </div>
      )}

      <div className="auth-links">
        <button type="button" className="link-btn" onClick={onBack}>
          ログイン画面に戻る
        </button>
      </div>
    </AuthShell>
  );
}

// Supabase からのパスワード再設定リンクを踏んだ後に表示する画面
// （ルーティングは README を参照。/reset-password に割り当ててください）
export function ResetPasswordPage({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!password) return setError("新しいパスワードを入力してください。");
    if (password.length < 6) return setError("パスワードは6文字以上で設定してください。");
    if (password !== confirm) return setError("確認用パスワードが一致しません。");
    setError("");
    setLoading(true);
    try {
      await api.updatePassword(password);
      setDone(true);
    } catch (err) {
      setError("更新に失敗しました。リンクの有効期限が切れている可能性があります。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="新しいパスワードの設定" subtitle="">
      {done ? (
        <>
          <p className="login-hint" style={{ marginTop: 0 }}>
            パスワードを更新しました。
          </p>
          <button type="button" className="btn btn-primary login-btn" onClick={onDone}>
            ログイン画面へ
          </button>
        </>
      ) : (
        <div className="login-form">
          <Field label="新しいパスワード" required>
            <input
              className="input"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="新しいパスワード（確認）" required>
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
          {error && <p className="error-text">{error}</p>}
          <button type="button" className="btn btn-primary login-btn" onClick={submit} disabled={loading}>
            {loading ? "更新中…" : "パスワードを更新"}
          </button>
        </div>
      )}
    </AuthShell>
  );
}
