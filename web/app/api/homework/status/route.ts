import { NextResponse } from "next/server";
import { getHomeworkJob } from "@/lib/homework-jobs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("jobId")?.trim();
  const owner = url.searchParams.get("owner") || undefined;
  if (!jobId) return NextResponse.json({ error: "缺少任务标识" }, { status: 400 });
  const job = await getHomeworkJob(jobId, owner);
  if (!job) return NextResponse.json({ error: "任务不存在或无权访问" }, { status: 404 });
  if (job.status === "failed") return NextResponse.json({ status: job.status, error: job.error || "后台生成失败" }, { status: 500 });
  if (job.status === "completed" && job.result) return NextResponse.json({ status: job.status, result: job.result });
  return NextResponse.json({ status: job.status, jobId: job.jobId, feature: job.feature, updatedAt: job.updatedAt });
}
