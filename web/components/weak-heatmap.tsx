import Link from "next/link";
import type { WeakPoint } from "@/lib/types";

export function WeakHeatmap({ points, onDelete }: { points: WeakPoint[]; onDelete?: (point: WeakPoint, event: React.MouseEvent) => void }) {
  if (points.length === 0) {
    return <p className="muted">暂无薄弱点记录</p>;
  }

  return (
    <div className="heatmap" aria-label="薄弱知识点热力图">
      {points.map((point) => {
        const heatLevel = (point as WeakPoint & { progress?: number; level?: string }).progress;
        const masteryLevel = (point as WeakPoint & { level?: string }).level;
        return (
          <Link
            href={`/resources?knowledge=${encodeURIComponent(point.name)}`}
            key={`${point.id}:${point.name}`}
            className="heat-cell"
            style={{ "--level": point.severity } as React.CSSProperties}
            title={onDelete ? `${point.name}，右键删除` : `${point.name}，薄弱程度 ${point.severity}%${heatLevel !== undefined ? ` · 学习进度 ${Math.round(heatLevel)}%` : ""}${masteryLevel ? ` (${masteryLevel})` : ""}`}
            onContextMenu={(event) => {
              if (!onDelete) return;
              event.preventDefault();
              onDelete(point, event);
            }}
          >
            <span>{point.name}</span>
            <div className="heat-progress-bar">
              <div className="heat-progress-fill" style={{ width: `${point.mastery}%` }} />
            </div>
            <strong>{point.mastery}%</strong>
            {heatLevel !== undefined ? (
              <span className="muted" style={{ fontSize: "0.65rem", display: "block", marginTop: "2px" }}>
                进度 {Math.round(heatLevel)}%
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
