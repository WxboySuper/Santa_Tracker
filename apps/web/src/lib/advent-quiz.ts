import { z } from "zod";

const questionSchema = z.object({
  prompt: z.string().trim().min(1),
  choices: z.array(z.string().trim().min(1)).min(2).max(5),
  answerIndex: z.number().int().nonnegative(),
  explanation: z.string().optional(),
  source: z.string().optional(),
}).strict().refine(question => question.answerIndex < question.choices.length);

const quizSchema = z.object({
  title: z.string().optional(),
  questions: z.array(questionSchema).min(1).max(10),
}).strict();

export type Quiz = z.infer<typeof quizSchema>;
export type QuizState = { phase: "answering" | "feedback" | "done"; questionIndex: number; selectedIndex: number | null; score: number };
export type QuizAction =
  | { type: "select"; index: number }
  | { type: "check"; answerIndex: number }
  | { type: "next"; questionCount: number }
  | { type: "restart" };

export function parseQuiz(payload: unknown): Quiz | null {
  const parsed = quizSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export function initialQuizState(): QuizState {
  return { phase: "answering", questionIndex: 0, selectedIndex: null, score: 0 };
}

export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  if (action.type === "restart") return initialQuizState();
  if (action.type === "select") return selectAnswer(state, action.index);
  if (action.type === "check") return checkAnswer(state, action.answerIndex);
  if (action.type === "next") return nextQuestion(state, action.questionCount);
  return state;
}

function selectAnswer(state: QuizState, index: number): QuizState {
  if (state.phase !== "answering" || !Number.isInteger(index) || index < 0) return state;
  return { ...state, selectedIndex: index };
}

function checkAnswer(state: QuizState, answerIndex: number): QuizState {
  if (state.phase !== "answering" || state.selectedIndex === null) return state;
  return { ...state, phase: "feedback", score: state.score + Number(state.selectedIndex === answerIndex) };
}

function nextQuestion(state: QuizState, questionCount: number): QuizState {
  if (state.phase !== "feedback" || !Number.isInteger(questionCount) || questionCount < 1) return state;
  const questionIndex = state.questionIndex + 1;
  if (questionIndex >= questionCount) return { ...state, phase: "done" };
  return { ...state, phase: "answering", questionIndex, selectedIndex: null };
}
