import { RouteSchema, type Route } from '@santa-tracker/contracts';
import type { z } from 'zod';

export type ValidationIssue = {
  path: string;
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
  route?: Route;
};

function zodIssuesToValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((i) => ({
    path: i.path.join('.'),
    message: i.message,
  }));
}

function isDepartureAfterArrival(stop: Route['stops'][number]): boolean {
  return Date.parse(stop.departureIso) > Date.parse(stop.arrivalIso);
}

function isArrivalIncreasing(prevArrivalMs: number, arrivalMs: number): boolean {
  return arrivalMs > prevArrivalMs;
}

function collectChronologicalIssues(route: Route): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (let i = 0; i < route.stops.length; i++) {
    const stop = route.stops[i];
    if (!stop) continue;

    if (!isDepartureAfterArrival(stop)) {
      issues.push({ path: `stops.${i}.departureIso`, message: 'departure must be after arrival' });
    }

    if (i === 0) continue;

    const prev = route.stops[i - 1];
    if (!prev) continue;

    const arrivalMs = Date.parse(stop.arrivalIso);
    const prevArrivalMs = Date.parse(prev.arrivalIso);

    if (!isArrivalIncreasing(prevArrivalMs, arrivalMs)) {
      issues.push({ path: `stops.${i}.arrivalIso`, message: 'arrival must be strictly increasing' });
    }
  }

  return issues;
}

/**
 * Pure validation — no I/O, no clock.
 */
export function validateRoute(input: unknown): ValidationResult {
  const parsed = RouteSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, issues: zodIssuesToValidationIssues(parsed.error) };
  }

  const chronologicalIssues = collectChronologicalIssues(parsed.data);

  if (chronologicalIssues.length > 0) {
    return { ok: false, issues: chronologicalIssues };
  }

  return { ok: true, issues: [], route: parsed.data };
}
