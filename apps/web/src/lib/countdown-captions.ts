/** A dry, warm line for the countdown panel, chosen by how many whole days are left. */
const CAPTIONS: readonly (readonly [maxDays: number, line: string])[] = [
  [0, 'He left a note on the door: back in a few hours, do not touch the cookies.'],
  [1, 'Tomorrow. The reindeer have been told to stop discussing it.'],
  [3, 'The sleigh has been polished twice. It was clean the first time.'],
  [7, 'One week. The list is final, and nobody is allowed to look at it.'],
  [14, 'Two weeks. The elves have switched to the good tape.'],
  [24, 'The wrapping paper has been counted. Then counted again, out of nerves.'],
  [38, 'Plenty of time, said everyone, shortly before checking the calendar.'],
  [Number.POSITIVE_INFINITY, 'Early days. The workshop is still pretending it is not in a hurry.'],
];

export function countdownCaption(daysLeft: number): string {
  const days = Math.max(0, Math.floor(daysLeft));
  for (const [maxDays, line] of CAPTIONS) {
    if (days <= maxDays) return line;
  }
  return CAPTIONS[CAPTIONS.length - 1]?.[1] ?? '';
}

export const GARLAND_BULBS = 54;

/** One bulb per day, Nov 1 to Dec 24. Before November every bulb is lit; the count never grows past the garland. */
export function garlandBulbs(daysLeft: number): { total: number; lit: number } {
  const lit = Math.min(GARLAND_BULBS, Math.max(1, Math.floor(daysLeft) + 1));
  return { total: GARLAND_BULBS, lit };
}
