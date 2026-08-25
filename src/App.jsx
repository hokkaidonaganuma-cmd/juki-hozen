import React, { useEffect, useState } from "react";
import * as api from "./api";
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage } from "./components/Auth";
import Ledger from "./components/Ledger";

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = 判定中, null = 未ログイン
  const [profile, setProfile] = useState(null);
  const [authView, setAuthView] = useState("login"); // "login" | "register" | "forgot"

  // Supabase のパスワード再設定メールのリンクは /reset-password に着地する想定
  const isResetRoute = typeof window !== "undefined" && window.location.pathname === "/reset-password";

  useEffect(() => {
    api.getSession().then(setSession);
    const sub = api.onAuthStateChange((s) => setSession(s));
    return () => sub.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && session.user) {
      api
        .fetchProfile(session.user.id)
        .then(setProfile)
        .catch(() => setProfile({ display_name: session.user.email }));
    } else {
      setProfile(null);
    }
  }, [session]);

  if (isResetRoute) {
    return (
      <ResetPasswordPage
        onDone={() => {
          window.history.replaceState({}, "", "/");
          window.location.reload();
        }}
      />
    );
  }

  if (session === undefined) {
    return (
      <div className="ledger-loading">
        <div className="seal-mark">検</div>
        <p>読み込み中…</p>
      </div>
    );
  }

  if (!session) {
    if (authView === "register") {
      return <RegisterPage onBackToLogin={() => setAuthView("login")} />;
    }
    if (authView === "forgot") {
      return <ForgotPasswordPage onBack={() => setAuthView("login")} />;
    }
    return (
      <LoginPage onGoRegister={() => setAuthView("register")} onGoForgot={() => setAuthView("forgot")} />
    );
  }

  return <Ledger profile={profile} onSignOut={() => api.signOut()} />;
}
