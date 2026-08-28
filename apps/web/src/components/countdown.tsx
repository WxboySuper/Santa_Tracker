"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, createTranslator } from "@santa-tracker/localization";
import { formatCountdown, nextTakeoff } from "@/lib/countdown";

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

  useEffect(() => {
    const target = nextTakeoff(new Date());
    const update = () => setValue(formatCountdown(target, new Date(), flyingText ?? translator.t("countdown.onHisWay")));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [flyingText, translator]);

  return <div className={className} aria-live="polite">{value}</div>;
}
