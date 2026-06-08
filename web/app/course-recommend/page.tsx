import { FeatureWorkspace } from "@/components/feature-workspace";
import { PersonalizedGate } from "@/components/personalized-gate";

export default function CourseRecommendPage() {
  return (
    <PersonalizedGate>
      <FeatureWorkspace feature="course_recommend" />
    </PersonalizedGate>
  );
}
