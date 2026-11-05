"use client";

import { useState, type SyntheticEvent } from "react";
import { createTranslator } from "@santa-tracker/localization";
import { encode, isCipherAnswerCorrect, type CipherConfig } from "@/lib/cipher";

export function CipherActivity({ config }: { config: CipherConfig }) {
  const translator = createTranslator();
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [showWheel, setShowWheel] = useState(false);
  const coded = encode(config.message, config.shift);
  const wheel = Array.from({ length: 26 }, (_, index) => ({
    plain: String.fromCharCode(65 + index),
    coded: String.fromCharCode(65 + ((index + config.shift) % 26)),
  }));

  function checkAnswer(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitted = new FormData(event.currentTarget).get("answer");
    const submittedAnswer = typeof submitted === "string" ? submitted : "";
    setAnswer(submittedAnswer);
    setFeedback(isCipherAnswerCorrect({ submitted: submittedAnswer, expected: config.message })
      ? translator.t("advent.activity.cipher.correct")
      : translator.t("advent.activity.cipher.tryAgain"));
  }

  return (
    <section className="space-y-5" aria-labelledby="cipher-title">
      <h2 id="cipher-title" className="text-2xl font-bold">{translator.t("advent.activity.cipher.title")}</h2>
      <p>{translator.t("advent.activity.cipher.instructions")}</p>
      <p className="break-words rounded-xl bg-slate-100 p-5 text-center font-mono text-2xl font-bold tracking-widest text-slate-900" aria-label={translator.t("advent.activity.cipher.codedMessage")}>
        {coded}
      </p>
      <form className="space-y-3" onSubmit={checkAnswer}>
        <label className="block font-semibold" htmlFor="cipher-answer">{translator.t("advent.activity.cipher.answerLabel")}</label>
        <input
          id="cipher-answer"
          name="answer"
          className="w-full rounded-lg border border-slate-500 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
          autoComplete="off"
          value={answer}
          onChange={(event) => setAnswer(event.currentTarget.value)}
        />
        <button className="rounded-lg bg-blue-800 px-4 py-2 font-semibold text-white hover:bg-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700" type="submit">
          {translator.t("advent.activity.cipher.check")}
        </button>
      </form>
      <p aria-live="polite" aria-atomic="true" className="min-h-6 font-semibold">{feedback}</p>
      {config.hint ? (
        <div>
          <button className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700" type="button" aria-expanded={showHint} onClick={() => setShowHint((visible) => !visible)}>
            {showHint ? translator.t("advent.activity.cipher.hideHint") : translator.t("advent.activity.cipher.showHint")}
          </button>
          {showHint ? <p className="mt-2">{config.hint}</p> : null}
        </div>
      ) : null}
      <div>
        <button className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700" type="button" aria-expanded={showWheel} onClick={() => setShowWheel((visible) => !visible)}>
          {showWheel ? translator.t("advent.activity.cipher.hideWheel") : translator.t("advent.activity.cipher.showWheel")}
        </button>
        {showWheel ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full border-collapse text-center font-mono" aria-label={translator.t("advent.activity.cipher.wheelLabel")}>
              <thead><tr><th className="p-2 text-left">{translator.t("advent.activity.cipher.alphabet")}</th>{wheel.map(({ plain }) => <th className="p-2" key={plain}>{plain}</th>)}</tr></thead>
              <tbody><tr><th className="p-2 text-left">{translator.t("advent.activity.cipher.shifted")}</th>{wheel.map(({ coded: letter }) => <td className="p-2" key={letter}>{letter}</td>)}</tr></tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
