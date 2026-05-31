export type QuestionCategory = {
  id: string;
  group: string;
  title: string;
  questions: string[];
};

export type AMRStateName = "NEW" | "MUSCLE" | "RETENTION" | "RETAINED";

export type AMRQuestion = {
  id: string;
  text: string;
  category_id: string;
  category: string;
  group: string;
  track: "ic" | "leadership";
  block: string;
};

export type MuscleRep = {
  id: number;
  d: string;
  r: "travei" | "fluiu";
};

export type RetentionAttempt = {
  id: number;
  d: string;
  transcript: string;
  has_audio?: boolean;
  ev: {
    substancia?: {
      nota?: number;
      comentario?: string;
    };
    vocabulario?: {
      alcancado?: string[];
      evitado_ou_simplificado?: string[];
      comentario?: string;
    };
    hesitacao?: {
      densidade?: string;
      exemplos?: string[];
      comentario?: string;
    };
    foco_proxima_rep?: string;
  };
};

export type AMRProgress = {
  question_id: string;
  state: AMRStateName;
  written_answer: string;
  touched_at: string;
  retained_at: string | null;
  next_review_at: string | null;
  last_reviewed_at: string | null;
  reps: MuscleRep[];
  retention: RetentionAttempt[];
};

export type AMRStats = {
  counts: Record<AMRStateName, number>;
  written: number;
  reps: number;
  retention_attempts: number;
  total: number;
};

export type AMRTodayItem = {
  kind: "AQUECIMENTO" | "ATIVACAO" | "MUSCULACAO" | "RETENCAO";
  question_id: string;
};

export type AMRStateResponse = {
  questions: AMRQuestion[];
  progress: Record<string, AMRProgress>;
  stats: AMRStats;
  today: AMRTodayItem[];
};

export type Feedback = {
  summary: string;
  fluency_score: number;
  clarity_score: number;
  interview_readiness_score: number;
  strengths: string[];
  improvements: string[];
  vocabulary_recovery: Array<{
    idea: string;
    better_phrases: string[];
  }>;
  suggested_rewrite: string;
  follow_up_questions: string[];
};

export type PracticeResponse = {
  session_id: string;
  round: number;
  question: string;
  transcript: string;
  feedback: Feedback;
  follow_up_questions: string[];
};
