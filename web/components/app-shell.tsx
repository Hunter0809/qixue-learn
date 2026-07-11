"use client";

import { useEffect } from "react";

import { usePathname } from "next/navigation";
import { BarChart3, BookOpenCheck, CalendarDays, Camera, Home, Languages, MessageCircleQuestion, Sparkles, Timer } from "lucide-react";
import clsx from "clsx";
import { UserMenu } from "@/components/user-menu";
import { useLearningStore } from "@/lib/store";

const navItems = [
  { href: "/", label: "首页", icon: Home },
  { href: "/pomodoro", label: "番茄钟", icon: Timer },
  { href: "/photo-search", label: "拍照搜题", icon: Camera },
  { href: "/ai-answer", label: "智能答疑", icon: MessageCircleQuestion },
  { href: "/homework", label: "作业中心", icon: BookOpenCheck },
  { href: "/language-tools", label: "语言工具", icon: Languages },
  { href: "/review-plan", label: "复习计划", icon: CalendarDays },
  { href: "/resources", label: "个性资源", icon: Sparkles },
  { href: "/report", label: "学习报告", icon: BarChart3 }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    useLearningStore.getState().hydrateWorkspaceStates();
  }, []);

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-logo">
            <img alt="启学智伴 Logo" src="/logo.png" />
          </span>
          <span>
            启学智伴
            <small>Agent Learning OS</small>
          </span>
        </a>
        <nav className="nav" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
            return (
              <a aria-current={active ? "page" : undefined} className={clsx("nav-link", active && "active")} href={item.href} key={item.href}>
                <Icon size={18} aria-hidden />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="header-right">
          <UserMenu />
        </div>
      </header>
      <main className="main">
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

