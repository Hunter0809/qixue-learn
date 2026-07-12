"use client";

import { ExternalLink, Video } from "lucide-react";
import { trackLearningBehavior } from "@/lib/behavior-tracking";
import { getLearnerProfile, loadCurrentUsername } from "@/lib/profile-storage";

export type VideoResource = {
  id: string;
  title: string;
  subject: string;
  knowledge: string;
  url: string;
  source: string;
  publisher?: string;
  duration?: string;
  level?: string;
};

export function LearningVideoCard({ video }: { video: VideoResource }) {
  function trackClick() {
    const subject = video.subject || video.level || "综合";
    const knowledge = video.knowledge || video.title;
    trackLearningBehavior({ knowledge, subject, source: "video_click" });
    void fetch("/api/behavior", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner: loadCurrentUsername() || undefined,
        subject,
        knowledge,
        source: "video_click",
        correct: true,
        profile: getLearnerProfile()
      })
    }).catch(() => undefined);
  }

  return (
    <a className="card video-card" href={video.url} target="_blank" rel="noopener noreferrer" onClick={trackClick}>
      <div className="video-card-icon">
        <Video size={20} />
      </div>
      <div className="video-card-body">
        <span className="resource-meta">
          <span className="pill">{video.subject}</span>
          <span className="pill">{video.publisher || video.source}</span>
        </span>
        <h3 className="video-card-title">{video.title}</h3>
        <p className="video-card-knowledge">{video.knowledge}</p>
        <span className="video-direct-link">{video.url}</span>
        {video.duration ? <span className="muted">{video.duration}</span> : null}
      </div>
      <ExternalLink size={14} className="video-card-link" />
    </a>
  );
}
