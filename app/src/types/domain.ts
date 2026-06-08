export type TaskStatus = "todo" | "done";

export type TodayTask = {
  id: string;
  title: string;
  knowledge: string;
  exercises: number;
  minutes: number;
  status: TaskStatus;
};

export type WeakPoint = {
  id: string;
  name: string;
  mastery: number;
  severity: number;
};

export type Resource = {
  id: string;
  title: string;
  type: "lecture" | "exercise" | "diagram" | "analogy";
  subject?: string;
  knowledge: string;
  difficulty: "easy" | "medium" | "hard";
  summary: string;
  content?: string;
};

export type ProfileResponse = {
  progress: number;
  completedKnowledge: number;
  totalKnowledge: number;
  streakDays: number;
  today_tasks: TodayTask[];
  weak_points: WeakPoint[];
  recommended_resources: Resource[];
};

export type HomeworkFeature =
  | "photo_search"
  | "ai_answer"
  | "homework_review"
  | "essay_correction"
  | "oral_practice"
  | "word_lookup"
  | "photo_translate"
  | "mental_math_check"
  | "document_scan"
  | "recitation"
  | "course_recommend"
  | "parent_report";

export type HomeworkRequest = {
  feature: HomeworkFeature;
  subject: string;
  content: string;
  imageUrl?: string;
  forceAI?: boolean;
};

export type HomeworkResponse = {
  feature: HomeworkFeature;
  title: string;
  answer: string;
  sections?: { title: string; items: string[] }[];
  steps: string[];
  knowledge: string[];
  similarPractice: {
    id: string;
    type: "choice" | "blank" | "coding" | "short";
    knowledge: string;
    difficulty: "easy" | "medium" | "hard";
    stem: string;
    options?: string[] | null;
  }[];
  nextAction: string;
};
