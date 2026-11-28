"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, createTranslator } from "@santa-tracker/localization";
import { countdownTarget, formatCountdown } from "@/lib/countdown";
import { useTrackerNow } from "@/lib/use-tracker-now";

interface CountdownProps {
  className?: string;
  flyingText?: string;
  locale?: string;
}

export default function Countdown({ className, flyingText, locale = DEFAULT_LOCALE }: CountdownProps) {
  const translator = useMemo(() => createTranslator({ locale }), [locale]);
  const [value, setValue] = useState(translator.t("countdown.loading"));

  useEffect(() => {
    setValue(translator.t("countdown.loading"));
  }, [translator]);

  const now = useTrackerNow();
  useEffect(() => {
    setValue(formatCountdown(countdownTarget(now), now, flyingText ?? translator.t("countdown.onHisWay")));
  }, [flyingText, now, translator]);

  return <div className={className} aria-live="polite">{value}</div>;
}
