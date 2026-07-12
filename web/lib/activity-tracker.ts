"use client";

type ActivityStats = {
  totalMinutes: number;
  lastActive: number;
  sessionsCount: number;
};

const STORAGE_KEY = "qixue_activity";

let intervalId: ReturnType<typeof setInterval> | null = null;
let lastVisibleStart = 0;

function loadStats(): ActivityStats {
  if (typeof window === "undefined") return { totalMinutes: 0, lastActive: 0, sessionsCount: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { totalMinutes: 0, lastActive: 0, sessionsCount: 0 };
    const parsed = JSON.parse(raw) as Partial<ActivityStats>;
    return {
      totalMinutes: parsed.totalMinutes ?? 0,
      lastActive: parsed.lastActive ?? 0,
      sessionsCount: parsed.sessionsCount ?? 0
    };
  } catch {
    return { totalMinutes: 0, lastActive: 0, sessionsCount: 0 };
  }
}

function saveStats(stats: ActivityStats) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

export function getActivityStats(): ActivityStats {
  return loadStats();
}

export function recordSession() {
  const stats = loadStats();
  stats.sessionsCount += 1;
  stats.lastActive = Date.now();
  saveStats(stats);
}

export function startTracking() {
  if (typeof window === "undefined") return;
  recordSession();
  lastVisibleStart = performance.now();

  const onVisibility = () => {
    if (document.hidden) {
      const elapsed = (performance.now() - lastVisibleStart) / 60000;
      const stats = loadStats();
      stats.totalMinutes += elapsed;
      stats.lastActive = Date.now();
      saveStats(stats);
    } else {
      lastVisibleStart = performance.now();
    }
  };

  document.addEventListener("visibilitychange", onVisibility);

  intervalId = setInterval(() => {
    if (!document.hidden) {
      const stats = loadStats();
      stats.totalMinutes += 1;
      stats.lastActive = Date.now();
      saveStats(stats);
    }
  }, 60000);
}
