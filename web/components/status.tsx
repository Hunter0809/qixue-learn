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
