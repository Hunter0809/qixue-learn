"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Link2, Link2Off, LogOut, UserRound } from "lucide-react";
import {
  enterGuestSession,
  isGuestSession,
  loadCurrentUserProfile,
  logoutUser,
  type StoredUser
} from "@/lib/profile-storage";
import { LoginModal } from "@/components/login-modal";

function Avatar({ user, guest }: { user: StoredUser | null; guest: boolean }) {
  if (guest) return <UserRound size={16} />;
  if (!user) return <UserRound size={16} />;
  if (user.avatarUrl.startsWith("data:")) return <img alt="头像" src={user.avatarUrl} />;
  return <span>{user.avatarUrl.startsWith("text:") ? user.avatarUrl.slice(5) : user.nickname.slice(0, 1)}</span>;
}

export function UserMenu() {
  const [user, setUser] = useState<StoredUser | null>(null);
  const [guest, setGuest] = useState(false);
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [agentConnected, setAgentConnected] = useState(false);

  function refresh() {
    setUser(loadCurrentUserProfile());
    setGuest(isGuestSession());
  }

  useEffect(() => {
    refresh();
    fetch("/api/agent/status")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { connected: boolean }) => setAgentConnected(data.connected))
      .catch(() => setAgentConnected(false));
  }, []);

  function notifyAuthChanged() {
    window.dispatchEvent(new Event("auth-changed"));
  }

  return (
    <div className="user-menu">
      <button className="user-trigger" onClick={() => user || guest ? setOpen((value) => !value) : setLoginOpen(true)} type="button">
        <span className={agentConnected ? "agent-link online" : "agent-link offline"} title={agentConnected ? "mimo 已连接" : "mimo 未连接"}>
          {agentConnected ? <Link2 size={14} /> : <Link2Off size={14} />}
        </span>
        <span className="avatar mini"><Avatar user={user} guest={guest} /></span>
        <span>{guest ? "游客" : user?.nickname || "登录 / 注册"}</span>
      </button>
      {open ? (
        <div className="user-popover">
          {!guest ? <Link href="/profile" onClick={() => setOpen(false)}>个人中心</Link> : null}
          {guest ? <button onClick={() => { setLoginOpen(true); setOpen(false); }} type="button">注册个人信息</button> : null}
          <button onClick={() => { logoutUser(); setUser(null); setGuest(false); setOpen(false); notifyAuthChanged(); }} type="button">
            <LogOut size={14} /> 退出
          </button>
        </div>
      ) : null}
      {loginOpen ? (
        <LoginModal
          onClose={() => setLoginOpen(false)}
          onDone={(nextUser) => { setUser(nextUser); setGuest(false); setLoginOpen(false); notifyAuthChanged(); }}
          onGuest={() => { enterGuestSession(); setUser(null); setGuest(true); setLoginOpen(false); notifyAuthChanged(); }}
        />
      ) : null}
    </div>
  );
}
