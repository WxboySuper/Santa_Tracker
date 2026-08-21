import { RouteSchema, type Route } from '@santa-tracker/contracts';

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
  route?: Route;
};

/**
 * Pure validation — no I/O, no clock.
 */
export function validateRoute(input: unknown): ValidationResult {
  const parsed = RouteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }

  const route = parsed.data;
  const issues: ValidationIssue[] = [];

  // Enforce strictly increasing arrival times and departure after arrival.
  for (let i = 0; i < route.stops.length; i++) {
    const stop = route.stops[i];
    if (!stop) continue;
    const arrival = Date.parse(stop.arrivalIso);
    const departure = Date.parse(stop.departureIso);
    if (departure <= arrival) {
      issues.push({ path: `stops.${i}.departureIso`, message: 'departure must be after arrival' });
    }
    if (i > 0) {
      const prev = route.stops[i - 1];
      if (prev) {
        const prevArrival = Date.parse(prev.arrivalIso);
        if (arrival <= prevArrival) {
          issues.push({ path: `stops.${i}.arrivalIso`, message: 'arrival must be strictly increasing' });
        }
      }
    }
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, issues: [], route };
}
