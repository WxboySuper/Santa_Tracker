import { describe, expect, it } from 'vitest';
import { deriveHomeCards } from '../home-cards';

const allAllowed = { adventAllowed: true, trackerAllowed: true };

describe('deriveHomeCards', () => {
  it.each([
    ['before Nov 30', '2026-11-29T23:59:59Z', 'before', 'before'],
    ['Nov 30 through Dec 23', '2026-12-23T23:59:59Z', 'open', 'before'],
    ['Dec 24 flight', '2026-12-24T10:00:00Z', 'open', 'open'],
    ['Dec 25 through Jan 6', '2027-01-06T23:59:59Z', 'open', 'open'],
    ['after Jan 7', '2027-01-07T00:00:00Z', 'after', 'after'],
  ])('derives both cards at %s', (_label, instant, advent, tracker) => {
    expect(deriveHomeCards({ ...allAllowed, now: new Date(instant) })).toMatchObject({
      advent: { status: advent },
      tracker: { status: tracker },
    });
  });

  it('uses pre-season copy in October and after-season copy in September', () => {
    expect(deriveHomeCards({ ...allAllowed, now: new Date('2026-10-15T12:00:00Z') })).toMatchObject(
      {
        advent: { status: 'before' },
        tracker: { status: 'before' },
      },
    );
    expect(deriveHomeCards({ ...allAllowed, now: new Date('2026-09-30T12:00:00Z') })).toMatchObject(
      {
        advent: { status: 'after' },
        tracker: { status: 'after' },
      },
    );
  });

  it('keeps Advent open during its replay window without claiming a door is open', () => {
    expect(
      deriveHomeCards({ ...allAllowed, now: new Date('2026-11-30T00:00:00Z') }).advent,
    ).toEqual({
      status: 'open',
      phase: 'before-doors',
    });
    expect(
      deriveHomeCards({ ...allAllowed, now: new Date('2027-01-06T12:00:00Z') }).advent,
    ).toEqual({
      status: 'open',
      phase: 'after-doors',
    });
  });

  it("uses the calendar's noon UTC unlock boundary", () => {
    expect(
      deriveHomeCards({ ...allAllowed, now: new Date('2026-12-05T11:59:59Z') }).advent.day,
    ).toBe(4);
    expect(
      deriveHomeCards({ ...allAllowed, now: new Date('2026-12-05T12:00:00Z') }).advent.day,
    ).toBe(5);
  });

  it('withholds the open-door detail when Advent access is closed', () => {
    expect(
      deriveHomeCards({
        ...allAllowed,
        adventAllowed: false,
        now: new Date('2026-12-05T12:00:00Z'),
      }).advent,
    ).toEqual({ status: 'open', phase: 'hidden' });
  });
});
