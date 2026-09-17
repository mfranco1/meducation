export type Difficulty = 'easy' | 'medium' | 'hard' | 'unknown';
export type AnswerSource = 'provided_key' | 'verified' | 'uncertain';
export type FeedbackMode = 'immediate' | 'exam';

export interface Choice { id: string; text: string }
export interface QuestionMetadata { topic?: string; subtopic?: string; system?: string; discipline?: string; difficulty?: Difficulty; questionType?: string; tags?: string[] }
export interface QuestionSource { pdfFile: string; page?: number }
export interface Question {
  id: string; subjectId: string; quizId: string; questionNumber?: number; stem: string; choices: Choice[];
  sourceAnswer?: string; verifiedAnswer?: string; answerSource: AnswerSource; answerNote?: string;
  rationale?: string; choiceExplanations?: Record<string, string>; pearls?: string[]; metadata: QuestionMetadata; source: QuestionSource;
}
export interface Subject { id: string; name: string; description: string; accent: string }
export interface Quiz { id: string; subjectId: string; name: string; sourcePdf: string; questionCount: number; status: 'ready' | 'needs_review' }
export interface QuestionResponse { questionId: string; selectedChoiceId?: string; flagged: boolean; locked: boolean; timeMs: number }
export interface Attempt { id: string; quizId: string; subjectId: string; feedbackMode: FeedbackMode; startedAt: string; elapsedMs?: number; timerStartedAt?: string; currentQuestionId?: string; completedAt?: string; responses: Record<string, QuestionResponse> }
export interface CompletedAttempt extends Attempt { completedAt: string; score: AttemptScore }
export interface AttemptScore { correct: number; incorrect: number; unanswered: number; total: number; percentage: number; elapsedMs: number }
export interface QuizRepository { listSubjects(): Subject[]; listQuizzes(subjectId: string): Quiz[]; listQuestions(quizId: string): Question[] }
export interface AttemptRepository { list(): CompletedAttempt[]; completionCount(quizId: string): number; lowestScore(quizId: string): number | undefined; getActive(quizId: string): Attempt | undefined; saveActive(attempt: Attempt): void; clearActive(quizId: string): void; saveCompleted(attempt: CompletedAttempt): void }
