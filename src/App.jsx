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
      <div className="app">
        <ResetPasswordPage
          onDone={() => {
            window.history.replaceState({}, "", "/");
            window.location.reload();
          }}
        />
      </div>
    );
  }

  if (session === undefined) {
    return (
      <div className="app">
        <div className="ledger-loading">
          <div className="seal-mark">検</div>
          <p>読み込み中…</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app">
        {authView === "register" && <RegisterPage onBackToLogin={() => setAuthView("login")} />}
        {authView === "forgot" && <ForgotPasswordPage onBack={() => setAuthView("login")} />}
        {authView === "login" && (
          <LoginPage onGoRegister={() => setAuthView("register")} onGoForgot={() => setAuthView("forgot")} />
        )}
      </div>
    );
  }

  const appStyle =
    profile && profile.background_image_url
      ? {
          backgroundImage: `linear-gradient(rgba(22,38,63,0.6), rgba(22,38,63,0.6)), url(${profile.background_image_url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
        }
      : undefined;

  return (
    <div className="app" style={appStyle}>
      <Ledger profile={profile} onProfileChange={setProfile} onSignOut={() => api.signOut()} />
    </div>
  );
}
