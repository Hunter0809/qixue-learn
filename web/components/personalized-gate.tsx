"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { LoginModal } from "@/components/login-modal";
import { isGuestSession, loadCurrentUserProfile, logoutUser, type StoredUser } from "@/lib/profile-storage";

export function PersonalizedGate({ children }: { children: React.ReactNode }) {
  const [guest, setGuest] = useState(false);
  const [user, setUser] = useState<StoredUser | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);

  function refresh() {
    setGuest(isGuestSession());
    setUser(loadCurrentUserProfile());
  }

  useEffect(() => refresh(), []);

  if (!guest || user) return <>{children}</>;

  return (
    <>
      <section className="section card personalized-lock">
        <div className="feature-mark"><UserRound size={30} /></div>
        <div>
          <span className="eyebrow">Personalized</span>
          <h1 className="page-title">需要注册个人信息</h1>
          <p className="page-kicker">游客模式不会保存学校、年级、地区、历史记录，因此无法生成个性化报告、资源推荐和个人中心内容。</p>
          <div className="quick-bar">
            <button className="button" onClick={() => { logoutUser(); setGuest(false); setLoginOpen(true); }} type="button">注册个人信息</button>
          </div>
        </div>
      </section>
      {loginOpen ? (
        <LoginModal
          onClose={() => setLoginOpen(false)}
          onDone={() => { setLoginOpen(false); refresh(); }}
        />
      ) : null}
    </>
  );
}
