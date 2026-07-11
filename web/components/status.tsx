"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { SERVICE_WARNING_EVENT } from "@/lib/client-warning";

export function LoadingBlock({ label = "正在加载数据" }: { label?: string }) {
  return (
    <div className="card" aria-busy="true">
      <div className="skeleton" />
      <p className="muted">{label}</p>
    </div>
  );
}

export function ErrorBlock({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "请求失败";
  return (
    <div className="card error" role="alert">
      <strong>数据无法渲染</strong>
      <p>{message}</p>
    </div>
  );
}

export function ServiceWarningModal() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    const handleWarning = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setMessage(detail?.message || "服务暂时不可用，请稍后重试或联系管理员。");
    };
    window.addEventListener(SERVICE_WARNING_EVENT, handleWarning);
    return () => window.removeEventListener(SERVICE_WARNING_EVENT, handleWarning);
  }, []);

  if (!message) return null;
  return (
    <div className="service-warning-backdrop" role="presentation">
      <section className="service-warning-modal" role="alertdialog" aria-modal="true" aria-labelledby="service-warning-title">
        <button className="service-warning-close" type="button" aria-label="关闭警告" onClick={() => setMessage("")}>
          <X size={18} />
        </button>
        <strong id="service-warning-title">服务警告</strong>
        <p>{message}</p>
        <button className="service-warning-confirm" type="button" onClick={() => setMessage("")}>知道了</button>
      </section>
    </div>
  );
}
