"use client";

import { createTranslator } from "@santa-tracker/localization";
import { useEffect, useMemo, useReducer, useRef } from "react";
import { initialQuizState, parseQuiz, quizReducer } from "@/lib/advent-quiz";

export function AdventQuiz({ payload }: { payload: unknown }) {
  const quiz = parseQuiz(payload);
  const translator = useMemo(() => createTranslator({ locale: "en" }), []);
  const [state, dispatch] = useReducer(quizReducer, undefined, initialQuizState);
  const focusRef = useRef<HTMLElement | null>(null);
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    focusRef.current?.focus();
  }, [state.phase, state.questionIndex]);

  if (!quiz) return null;
  const question = quiz.questions[state.questionIndex];
  if (state.phase === "done") {
    return (
      <section aria-labelledby="quiz-results-title" className="space-y-4">
        <h2 id="quiz-results-title" ref={(element) => { focusRef.current = element; }} tabIndex={-1} className="text-2xl font-bold">
          {translator.t("advent.quiz.results", { score: state.score, total: quiz.questions.length })}
        </h2>
        <button type="button" onClick={() => dispatch({ type: "restart" })} className="rounded-lg bg-slate-800 px-4 py-2 text-white underline focus-visible:outline-2 focus-visible:outline-offset-4">
          {translator.t("advent.quiz.tryAgain")}
        </button>
      </section>
    );
  }
  if (!question) return null;

  const correctChoice = question.choices[question.answerIndex] ?? "";
  const feedback = state.phase === "feedback"
    ? translator.t(state.selectedIndex === question.answerIndex ? "advent.quiz.correct" : "advent.quiz.incorrect", { choice: correctChoice })
    : "";

  return (
    <section className="space-y-4" aria-label={quiz.title ?? undefined}>
      {quiz.title && <h2 className="text-2xl font-bold">{quiz.title}</h2>}
      <p>{translator.t("advent.quiz.question", { current: state.questionIndex + 1, total: quiz.questions.length })}</p>
      <fieldset disabled={state.phase === "feedback"} className="space-y-3">
        <legend ref={(element) => { if (state.phase === "answering") focusRef.current = element; }} tabIndex={-1} className="mb-3 text-lg font-semibold">{question.prompt}</legend>
        <span className="sr-only">{translator.t("advent.quiz.choiceGroup")}</span>
        {question.choices.map((choice, index) => (
          <label key={`${index}-${choice}`} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-400 p-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-700">
            <input type="radio" name={`quiz-question-${state.questionIndex}`} value={index} checked={state.selectedIndex === index} onChange={() => dispatch({ type: "select", index })} className="size-5 accent-blue-800" />
            <span>{choice}</span>
          </label>
        ))}
      </fieldset>
      {state.phase === "answering" ? (
        <button type="button" disabled={state.selectedIndex === null} onClick={() => dispatch({ type: "check", answerIndex: question.answerIndex })} className="rounded-lg bg-slate-800 px-4 py-2 text-white underline focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-not-allowed disabled:opacity-50">
          {translator.t("advent.quiz.checkAnswer")}
        </button>
      ) : (
        <div aria-live="polite" aria-atomic="true" className="space-y-2">
          <h3 ref={(element) => { if (state.phase === "feedback") focusRef.current = element; }} tabIndex={-1} className="font-semibold">{feedback}</h3>
          {question.explanation && <p>{question.explanation}</p>}
          {question.source && <p>{translator.t("advent.quiz.source", { source: question.source })}</p>}
          <button type="button" onClick={() => dispatch({ type: "next", questionCount: quiz.questions.length })} className="rounded-lg bg-slate-800 px-4 py-2 text-white underline focus-visible:outline-2 focus-visible:outline-offset-4">
            {state.questionIndex === quiz.questions.length - 1 ? translator.t("advent.quiz.seeResults") : translator.t("advent.quiz.nextQuestion")}
          </button>
        </div>
      )}
    </section>
  );
}
