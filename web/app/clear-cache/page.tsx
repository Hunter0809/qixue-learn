"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2 } from "lucide-react";
import { clearSiteData, type SiteDataClearResult } from "@/lib/site-data-clear";

type ServerClearResult = {
  homeworkResponses: number;
};

export default function ClearCachePage() {
  const [siteResult, setSiteResult] = useState<SiteDataClearResult | null>(null);
  const [serverResult, setServerResult] = useState<ServerClearResult | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function run() {
      const [site, server] = await Promise.all([
        clearSiteData(),
        fetch("/api/cache/clear", { method: "POST", cache: "no-store" })
          .then((response) => response.ok ? response.json() as Promise<ServerClearResult> : null)
          .catch(() => null)
      ]);

      if (!mounted) return;
      setSiteResult(site);
      setServerResult(server);
      setDone(true);
    }

    void run();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section className="feature-page compact-page">
      <div className="section-heading">
        <span className="eyebrow">Reset</span>
        <h1>清理完成</h1>
        <p>本站临时缓存已清理，已注册用户档案、薄弱点、个性资源和学习历史会保留。</p>
      </div>

      <div className="card status-panel">
        {done ? <CheckCircle2 size={22} /> : <Loader2 className="spin" size={22} />}
        <div>
          <h2>{done ? "缓存已清理" : "正在清理"}</h2>
          <p>
            {done
              ? `已清除 ${siteResult?.localStorageKeys ?? 0} 个本地键、${siteResult?.sessionStorageKeys ?? 0} 个会话键、${siteResult?.cacheBuckets ?? 0} 个浏览器缓存桶、${siteResult?.cookies ?? 0} 个 Cookie。后端缓存条目：${serverResult?.homeworkResponses ?? 0}。`
              : "请保持此页面打开，清理会自动完成。"}
          </p>
        </div>
      </div>

      <div className="action-row">
        <Link className="button" href="/login">重新登录</Link>
        <Link className="button secondary" href="/">返回首页</Link>
      </div>
    </section>
  );
}
