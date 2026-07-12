"use client";

import { CheckCircle2, Circle, Pencil } from "lucide-react";
import type { TodayTask } from "@/lib/types";
import clsx from "clsx";

export function TaskCard({ task, onToggle, onEdit }: { task: TodayTask; onToggle: (id: string) => void; onEdit: (task: TodayTask) => void }) {
  const done = task.status === "done";
  return (
    <div className={clsx("task-card", done && "done")}>
      <button className="task-main" onClick={() => onToggle(task.id)} type="button">
        {done ? <CheckCircle2 size={20} /> : <Circle size={20} />}
        <span>
          <strong>{task.title}</strong>
          <small>{task.knowledge} · {task.exercises} 题 · {task.minutes} 分钟</small>
        </span>
      </button>
      <button className="task-edit-module" onClick={() => onEdit(task)} type="button" aria-label="编辑任务">
        <Pencil size={15} />
        <span>编辑</span>
      </button>
    </div>
  );
}
