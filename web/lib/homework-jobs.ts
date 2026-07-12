import { getStoredFixedResponse, setStoredFixedResponse } from "@/lib/server-db";
import type { HomeworkRequest, HomeworkResponse } from "@/lib/types";

export type HomeworkJob = {
  jobId: string;
  owner: string;
  status: "processing" | "completed" | "failed";
  feature: HomeworkRequest["feature"];
  result?: HomeworkResponse;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

const JOB_TTL_MS = 24 * 60 * 60 * 1000;

function key(jobId: string) {
  return `homework_job:${jobId}`;
}

function normalizeOwner(owner?: string) {
  return owner?.trim().toLowerCase() || "__anonymous__";
}

export async function createHomeworkJob(request: HomeworkRequest) {
  const jobId = `hw_${Date.now()}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const now = Date.now();
  const job: HomeworkJob = {
    jobId,
    owner: normalizeOwner(request.owner),
    status: "processing",
    feature: request.feature,
    createdAt: now,
    updatedAt: now
  };
  await setStoredFixedResponse(key(jobId), job, now + JOB_TTL_MS);
  return job;
}

export async function updateHomeworkJob(jobId: string, patch: Pick<HomeworkJob, "status" | "result" | "error">) {
  const current = await getStoredFixedResponse(key(jobId)) as HomeworkJob | null;
  if (!current) return;
  await setStoredFixedResponse(key(jobId), { ...current, ...patch, updatedAt: Date.now() }, Date.now() + JOB_TTL_MS);
}

export async function getHomeworkJob(jobId: string, owner?: string) {
  const job = await getStoredFixedResponse(key(jobId)) as HomeworkJob | null;
  if (!job || job.owner !== normalizeOwner(owner)) return null;
  return job;
}
