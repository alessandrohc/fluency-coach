export type QuestionCategory = {
  id: string;
  group: string;
  title: string;
  questions: string[];
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
