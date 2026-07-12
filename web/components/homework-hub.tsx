"use client";

import { useState } from "react";
import clsx from "clsx";
import { featureConfigs } from "@/lib/feature-config";
import type { HomeworkFeature } from "@/lib/types";
import { FeatureWorkspace } from "@/components/feature-workspace";

export type HomeworkGroupKey = "review" | "language" | "organize";

const groupedFeatures: Record<HomeworkGroupKey, { title: string; items: HomeworkFeature[] }> = {
  review: { title: "批改", items: ["homework_review", "essay_correction", "mental_math_check"] },
  language: { title: "语言", items: ["oral_practice", "word_lookup", "photo_translate"] },
  organize: { title: "整理", items: ["document_scan", "recitation", "parent_report"] }
};

export function HomeworkHub({ group = "review" }: { group?: HomeworkGroupKey }) {
  const currentGroup = groupedFeatures[group];
  const [active, setActive] = useState<HomeworkFeature>(currentGroup.items[0]);

  return (
    <>
      <section className="section grouped-toolbar homework-switcher">
        <div className="tool-group">
          <span>{currentGroup.title}</span>
          <div>
            {currentGroup.items.map((feature) => {
              const config = featureConfigs.find((item) => item.feature === feature);
              if (!config) return null;
              const Icon = config.icon;
              return (
                <button className={clsx("tool-chip", active === feature && "active")} key={feature} onClick={() => setActive(feature)} type="button">
                  <Icon size={16} />
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>
      <FeatureWorkspace feature={active} key={active} />
    </>
  );
}
