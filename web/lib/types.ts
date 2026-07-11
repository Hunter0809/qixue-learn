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

export type PlanRequest = {
  owner?: string;
  subject: string;
  goal: string;
  dailyMinutes: number;
  style: "examples" | "visual" | "practice";
  profile?: LearnerProfile;
};

export type PlanDay = {
  day: number;
  title: string;
  minutes: number;
  priority: number;
  knowledge: string[];
  resources: string[];
};

export type PlanResponse = {
  planId: string;
  summary: string;
  days: PlanDay[];
};

export type QuestionType = "choice" | "blank" | "coding" | "short";

export type QuizQuestion = {
  id: string;
  type: QuestionType;
  knowledge: string;
  difficulty: "easy" | "medium" | "hard";
  stem: string;
  options?: string[] | null;
};

export type QuizResponse = {
  quizId: string;
  title: string;
  durationMinutes: number;
  questions: QuizQuestion[];
};

export type QuizSubmitRequest = {
  quizId: string;
  answers: Record<string, string>;
};

export type QuestionFeedback = {
  questionId: string;
  score: number;
  feedback: string;
  weakPoint?: string;
};

export type QuizSubmitResponse = {
  totalScore: number;
  feedback: QuestionFeedback[];
  updatedWeakPoints: WeakPoint[];
};

export type ResourceRequest = {
  owner?: string;
  knowledge: string;
  type: Resource["type"];
  style: "plain" | "exam" | "practice";
  profile?: LearnerProfile;
};

export type ResourceResponse = {
  resources: Resource[];
};

export type MistakeAnalysis = {
  mistakeId: string;
  recognizedText: string;
  cause: string;
  knowledge: string[];
  hints: string[];
  fullExplanation: string;
  similarQuestions: QuizQuestion[];
};

export type ReportResponse = {
  range: "week" | "month";
  studyHours: number;
  masteredKnowledge: number;
  mistakeCount: number;
  accuracyTrend: { label: string; accuracy: number }[];
  reviewPlan: { id: string; date: string; title: string; minutes: number; reminder: string }[];
  weakPoints: WeakPoint[];
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
  owner?: string;
  feature: HomeworkFeature;
  subject: string;
  content: string;
  imageUrl?: string;
  profile?: LearnerProfile;
  forceAI?: boolean;
};

export type HomeworkResponse = {
  feature: HomeworkFeature;
  title: string;
  answer: string;
  sections?: { title: string; items: string[] }[];
  steps: string[];
  knowledge: string[];
  similarPractice: QuizQuestion[];
  nextAction: string;
};

export type DifficultyPreference = "基础" | "同步" | "提高" | "竞赛";

export type LearnerProfile = {
  nickname?: string;
  school?: string;
  grade?: string;
  region?: string;
  difficulty?: DifficultyPreference;
};
