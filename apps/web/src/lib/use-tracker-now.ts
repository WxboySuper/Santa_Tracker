"use client";

import { useEffect, useState } from "react";
import { subscribeTrackerClock, trackerNow, trackerTickMs } from "./tracker-clock";

/** The tracker clock as React state: ticks on its own and re-arms when the demo clock seeks, pauses or changes speed. */
export function useTrackerNow(): Date {
  const [now, setNow] = useState(() => trackerNow());
  useEffect(() => {
    let timer = 0;
    const arm = () => {
      window.clearInterval(timer);
      setNow(trackerNow());
      timer = window.setInterval(() => setNow(trackerNow()), trackerTickMs());
    };
    arm();
    const unsubscribe = subscribeTrackerClock(arm);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, []);
  return now;
}
