"use client";

import type { ProfileResponse, ReportResponse, Resource, WeakPoint } from "@/lib/types";
import {
  getLearningStreakDays,
  loadLearningHistory,
  loadTodayTasks,
  type LearningHistoryRecord
} from "@/lib/profile-storage";
import { getResourceFeed } from "@/lib/resource-cache";
import { getWeakPoints as getTrackedWeakPoints, getWeakPointProgress, getMasteryLevel } from "@/lib/store";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function startOfDay(time: number) {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function recordsInRange(records: LearningHistoryRecord[], days: number) {
  const boundary = startOfDay(Date.now()) - (days - 1) * MS_PER_DAY;
  return records.filter((record) => record.updatedAt >= boundary);
}

function knowledgeCounts(records: LearningHistoryRecord[]) {
  const counts = new Map<string, number>();
  for (const record of records) {
    for (const item of record.response.knowledge || []) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }
  }
  return counts;
}

function buildWeakPoints(records: LearningHistoryRecord[]): WeakPoint[] {
  return Array.from(knowledgeCounts(records).entries())
    .map(([name, count], index) => {
      const mastery = clamp(100 - count * 12, 24, 92);
      return {
        id: `weak_${index}_${name}`,
        name,
        mastery,
        severity: 100 - mastery
      };
    })
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 8);
}

function buildResources(records: LearningHistoryRecord[]): Resource[] {
  void records;
  void getTrackedWeakPoints();
  return getResourceFeed();
}

function buildTrackedWeakPoints(): WeakPoint[] {
  return getTrackedWeakPoints().map((point) => ({
    id: point.id,
    name: point.knowledge,
    mastery: getWeakPointProgress(point),
    severity: Math.round(point.weight)
  }));
}

function weightedWeakPointProgress() {
  const points = getTrackedWeakPoints();
  if (!points.length) {
    return {
      progress: 0,
      completedKnowledge: 0,
      totalKnowledge: 100
    };
  }

  const totalRawWeight = points.reduce((sum, point) => sum + clamp(point.weight, 1, 100), 0);
  const weighted = points.reduce((sum, point) => {
    const weight = clamp(point.weight, 1, 100);
    const masteryProgress = getWeakPointProgress(point);
    return sum + masteryProgress * (weight / totalRawWeight);
  }, 0);
  const progress = Math.round(weighted);

  return {
    progress,
    completedKnowledge: progress,
    totalKnowledge: 100
  };
}

function accuracyForRecords(records: LearningHistoryRecord[]) {
  const feedback = records.flatMap((record) => record.response.similarPractice || []);
  const completedTasks = loadTodayTasks().filter((task) => task.status === "done").length;
  const totalTasks = loadTodayTasks().length;
  const taskScore = totalTasks ? (completedTasks / totalTasks) * 100 : 0;
  const activityScore = clamp(records.length * 12, 0, 100);
  const practiceScore = clamp(feedback.length * 8, 0, 100);
  if (!records.length && !totalTasks) return 0;
  return Math.round((activityScore * 0.5) + (taskScore * 0.35) + (practiceScore * 0.15));
}

export function buildProfileFromActualData(): ProfileResponse {
  const history = loadLearningHistory();
  const tasks = loadTodayTasks();
  const weakPointProgress = weightedWeakPointProgress();

  return {
    progress: weakPointProgress.progress,
    completedKnowledge: weakPointProgress.completedKnowledge,
    totalKnowledge: Math.max(weakPointProgress.totalKnowledge, 1),
    streakDays: getLearningStreakDays(),
    today_tasks: tasks.map(({ ownerKey, createdAt, updatedAt, ...task }) => task),
    weak_points: buildTrackedWeakPoints(),
    recommended_resources: buildResources(history)
  };
}

export function buildReportFromActualData(range: "week" | "month"): ReportResponse {
  const days = range === "month" ? 30 : 7;
  const history = recordsInRange(loadLearningHistory(), days);
  const tasks = loadTodayTasks();
  const minutesFromHistory = history.reduce((sum, record) => sum + Math.max(6, Math.min(45, Math.ceil(record.input.length / 18))), 0);
  const minutesFromTasks = tasks.filter((task) => task.status === "done").reduce((sum, task) => sum + task.minutes, 0);
  const labels = range === "month" ? ["第1周", "第2周", "第3周", "第4周"] : ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

  return {
    range,
    studyHours: Number(((minutesFromHistory + minutesFromTasks) / 60).toFixed(1)),
    masteredKnowledge: knowledgeCounts(history).size,
    mistakeCount: history.filter((record) => record.feature.includes("review") || record.feature.includes("correction") || record.feature === "mental_math_check").length,
    accuracyTrend: labels.map((label, index) => {
      const bucket = range === "month"
        ? history.filter((record) => Math.floor((Date.now() - record.updatedAt) / (7 * MS_PER_DAY)) === labels.length - index - 1)
        : history.filter((record) => new Date(record.updatedAt).getDay() === (index + 1) % 7);
      return { label, accuracy: accuracyForRecords(bucket) };
    }),
    reviewPlan: tasks
      .filter((task) => task.status === "todo")
      .slice(0, 6)
      .map((task, index) => ({
        id: `review_${task.id}`,
        date: new Date(Date.now() + index * MS_PER_DAY).toISOString().slice(0, 10),
        title: task.title,
        minutes: task.minutes,
        reminder: "19:30"
      })),
    weakPoints: buildWeakPoints(history)
  };
}

export function streakMotto(days: number) {
  if (days <= 0) return "今天开始，记录会从第一次行动长出来。";
  if (days < 3) return "先把节奏站稳，进步会自己排队。";
  if (days < 7) return "连续的每一天，都在替未来省力。";
  return "你已经把学习变成了可以依靠的习惯。";
}
