import { describe, expect, it } from "vitest";
import { initialQuizState, parseQuiz, quizReducer } from "../advent-quiz";

const question = { prompt: "Pick one", choices: ["A", "B"], answerIndex: 0 };

describe("parseQuiz", () => {
  it("accepts optional content and one to ten valid questions", () => {
    expect(parseQuiz({ title: "Quiz", questions: [question] })).not.toBeNull();
    expect(parseQuiz({ questions: Array.from({ length: 10 }, () => question) })?.questions).toHaveLength(10);
    expect(parseQuiz({ title: "Quiz", questions: [question], image_url: "/static/quiz.jpg", url: "/quiz" })).not.toBeNull();
  });

  it.each([
    ["non-object", null],
    ["string payload", "quiz"],
    ["number payload", 1],
    ["undefined payload", undefined],
    ["missing questions", {}],
    ["no questions", { questions: [] }],
    ["more than ten questions", { questions: Array.from({ length: 11 }, () => question) }],
    ["missing prompt", { questions: [{ choices: ["A", "B"], answerIndex: 0 }] }],
    ["empty prompt", { questions: [{ ...question, prompt: " " }] }],
    ["fewer than two choices", { questions: [{ ...question, choices: ["A"] }] }],
    ["more than five choices", { questions: [{ ...question, choices: ["A", "B", "C", "D", "E", "F"] }] }],
    ["out of range answer", { questions: [{ ...question, answerIndex: 2 }] }],
    ["negative answer", { questions: [{ ...question, answerIndex: -1 }] }],
    ["non-integer answer", { questions: [{ ...question, answerIndex: 0.5 }] }],
    ["non-string prompt", { questions: [{ ...question, prompt: 1 }] }],
    ["non-string choice", { questions: [{ ...question, choices: ["A", 2] }] }],
    ["non-string explanation", { questions: [{ ...question, explanation: 1 }] }],
    ["non-string source", { questions: [{ ...question, source: false }] }],
    ["non-string title", { title: 1, questions: [question] }],
    ["array payload", [question]],
  ])("rejects %s", (_label, value) => {
    expect(parseQuiz(value)).toBeNull();
  });
});

describe("quizReducer", () => {
  it("ignores illegal actions and records answers through results and restart", () => {
    const initial = initialQuizState();
    expect(quizReducer(initial, { type: "check", answerIndex: 0 })).toEqual(initial);
    const selected = quizReducer(initial, { type: "select", index: 1 });
    const feedback = quizReducer(selected, { type: "check", answerIndex: 0 });
    expect(feedback).toMatchObject({ phase: "feedback", score: 0 });
    expect(quizReducer(feedback, { type: "select", index: 0 })).toEqual(feedback);
    const next = quizReducer(feedback, { type: "next", questionCount: 2 });
    expect(next).toMatchObject({ phase: "answering", questionIndex: 1, selectedIndex: null });
    const correct = quizReducer(quizReducer(next, { type: "select", index: 1 }), { type: "check", answerIndex: 1 });
    const done = quizReducer(correct, { type: "next", questionCount: 2 });
    expect(done).toMatchObject({ phase: "done", score: 1 });
    expect(quizReducer(done, { type: "restart" })).toEqual(initial);
  });
});
