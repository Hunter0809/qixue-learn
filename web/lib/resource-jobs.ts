import { getStoredFixedResponse, setStoredFixedResponse } from "@/lib/server-db";
import type { ResourceRequest, ResourceResponse } from "@/lib/types";

export type ResourceJob = {
  jobId: string;
  owner: string;
  status: "processing" | "completed" | "failed";
  result?: ResourceResponse;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

const JOB_TTL_MS = 24 * 60 * 60 * 1000;
function key(jobId: string) { return `resource_job:${jobId}`; }
function normalizeOwner(owner?: string) { return owner?.trim().toLowerCase() || "__anonymous__"; }

export async function createResourceJob(request: ResourceRequest) {
  const jobId = `res_${Date.now()}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const now = Date.now();
  const job: ResourceJob = { jobId, owner: normalizeOwner(request.owner), status: "processing", createdAt: now, updatedAt: now };
  await setStoredFixedResponse(key(jobId), job, now + JOB_TTL_MS);
  return job;
}

export async function updateResourceJob(jobId: string, patch: Pick<ResourceJob, "status" | "result" | "error">) {
  const current = await getStoredFixedResponse(key(jobId)) as ResourceJob | null;
  if (!current) return;
  await setStoredFixedResponse(key(jobId), { ...current, ...patch, updatedAt: Date.now() }, Date.now() + JOB_TTL_MS);
}

export async function getResourceJob(jobId: string, owner?: string) {
  const job = await getStoredFixedResponse(key(jobId)) as ResourceJob | null;
  if (!job || job.owner !== normalizeOwner(owner)) return null;
  return job;
}
