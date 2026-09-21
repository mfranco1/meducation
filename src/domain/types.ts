export type Difficulty = 'easy' | 'medium' | 'hard' | 'unknown';
export type RationaleProvenance = 'source_migrated' | 'ai_draft_reviewed';
export type FeedbackMode = 'immediate' | 'exam';
export type StreakMilestone = 3 | 5 | 10 | 25 | 50;

export interface Choice { id: string; text: string }
export interface QuestionMetadata { topic?: string; subtopic?: string; system?: string; difficulty?: Difficulty; questionType?: string; tags?: string[] }
export interface RationaleMetadata {
  sources?: string;
  answerReviewNote?: string;
  provenance?: RationaleProvenance;
  reviewedAt?: string;
  reviewNote?: string;
}
export interface Question {
  id: string; quizId: string; stem: string; choices: Choice[];
  answer?: string; verifiedAnswer?: string; answerNote?: string;
  rationale: string; rationaleMeta?: RationaleMetadata; choiceExplanations?: Record<string, string>; pearls?: string[]; metadata: QuestionMetadata;
}
export interface Subject { id: string; name: string; accent: string }
export interface Quiz { id: string; subjectId: string; name: string; questionCount: number }
export interface QuestionResponse { questionId: string; selectedChoiceId?: string; flagged: boolean; locked: boolean; timeMs: number }
export interface CelebrationProgress { correctStreak: number; awardedStreakMilestones: StreakMilestone[] }
export interface Attempt { id: string; quizId: string; subjectId: string; feedbackMode: FeedbackMode; startedAt: string; elapsedMs?: number; timerStartedAt?: string; currentQuestionId?: string; completedAt?: string; celebrationProgress?: CelebrationProgress; responses: Record<string, QuestionResponse> }
export interface CompletedAttempt extends Attempt { completedAt: string; score: AttemptScore }
export interface AttemptScore { correct: number; incorrect: number; unanswered: number; total: number; percentage: number; elapsedMs: number }
export interface RecentScore { percentage: number; completedAt: string }
export interface QuizRepository { listSubjects(): Subject[]; listQuizzes(subjectId: string): Quiz[]; listQuestions(quizId: string): Question[] }
export interface AttemptRepository { list(): CompletedAttempt[]; completionCount(quizId: string): number; lowestScore(quizId: string): number | undefined; latestScore(quizId: string): RecentScore | undefined; getActive(quizId: string): Attempt | undefined; saveActive(attempt: Attempt): void; clearActive(quizId: string): void; saveCompleted(attempt: CompletedAttempt): void }
