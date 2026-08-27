"use client";

import { useEffect, useState } from "react";
import { formatCountdown, nextTakeoff } from "@/lib/countdown";

interface CountdownProps {
  className?: string;
  flyingText?: string;
}

export default function Countdown({ className, flyingText }: CountdownProps) {
  const [value, setValue] = useState("Loading…");

  useEffect(() => {
    const target = nextTakeoff(new Date());
    const update = () => setValue(formatCountdown(target, new Date(), flyingText));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [flyingText]);

  return <div className={className} aria-live="polite">{value}</div>;
}
