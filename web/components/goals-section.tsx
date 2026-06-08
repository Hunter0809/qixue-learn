"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

type Goal = {
  id: string;
  title: string;
  deadline: string;
  completed: boolean;
  createdAt: number;
};

const STORAGE_KEY = "qixue_goals";

function loadGoals(): Goal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Goal[]) : [];
  } catch {
    return [];
  }
}

function saveGoals(goals: Goal[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
}

function sortedGoals(goals: Goal[]): Goal[] {
  return [...goals].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (!a.deadline && !b.deadline) return 0;
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline.localeCompare(b.deadline);
  });
}

export function GoalsSection() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setGoals(loadGoals());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) saveGoals(goals);
  }, [goals, mounted]);

  function addGoal() {
    if (!title.trim()) return;
    const g: Goal = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: title.trim(),
      deadline,
      completed: false,
      createdAt: Date.now(),
    };
    setGoals((prev) => [...prev, g]);
    setTitle("");
    setDeadline("");
    setEditorOpen(false);
  }

  function updateGoal() {
    if (!editing || !title.trim()) return;
    setGoals((prev) =>
      prev.map((g) => (g.id === editing.id ? { ...g, title: title.trim(), deadline } : g))
    );
    setEditing(null);
    setTitle("");
    setDeadline("");
    setEditorOpen(false);
  }

  function deleteGoal(id: string) {
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }

  function toggleComplete(id: string) {
    setGoals((prev) =>
      prev.map((g) => (g.id === id ? { ...g, completed: !g.completed } : g))
    );
  }

  function openNew() {
    setEditing(null);
    setTitle("");
    setDeadline("");
    setEditorOpen(true);
  }

  function openEdit(g: Goal) {
    setEditing(g);
    setTitle(g.title);
    setDeadline(g.deadline);
    setEditorOpen(true);
  }

  function cancelEdit() {
    setEditing(null);
    setTitle("");
    setDeadline("");
    setEditorOpen(false);
  }

  const sorted = sortedGoals(goals);

  return (
    <div className="goals-section">
      <div className="goals-header">
        <h3 className="goals-title">{"学习目标"}</h3>
        <button className="button secondary goals-add-btn" onClick={openNew} type="button">
          <Plus size={16} /> {"新建"}
        </button>
      </div>

      {editorOpen && (
        <div className="goals-editor card">
          <input className="input" placeholder={"输入目标标题"} value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          <div className="goals-editor-actions">
            <button className="button" onClick={editing ? updateGoal : addGoal} disabled={!title.trim()} type="button">
              <Check size={16} /> {"保存"}
            </button>
            <button className="button secondary" onClick={cancelEdit} type="button">
              <X size={16} /> {"取消"}
            </button>
          </div>
        </div>
      )}

      {sorted.length === 0 && !editorOpen && (
        <p className="goals-empty">{"暂无目标，点击上方新建"}</p>
      )}

      <div className="goals-list">
        {sorted.map((g) => (
          <div key={g.id} className={"goal-card card" + (g.completed ? " completed" : "")}>
            <div className="goal-main">
              <button className={"goal-checkbox" + (g.completed ? " checked" : "")} onClick={() => toggleComplete(g.id)} type="button" aria-label={g.completed ? "标记未完成" : "标记已完成"}>
                {g.completed && <Check size={14} />}
              </button>
              <div className="goal-info">
                <span className={"goal-title" + (g.completed ? " done" : "")}>{g.title}</span>
                {g.deadline && <span className="goal-deadline">{"截止"}: {g.deadline}</span>}
              </div>
            </div>
            <div className="goal-actions">
              {!g.completed && (
                <button className="icon-button secondary" onClick={() => openEdit(g)} type="button" aria-label={"编辑"}>
                  <Pencil size={14} />
                </button>
              )}
              <button className="icon-button secondary" onClick={() => deleteGoal(g.id)} type="button" aria-label={"删除"}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
