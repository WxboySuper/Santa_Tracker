import { describe, expect, it } from 'vitest';
import { buildExperiences } from './build-experiences';

describe('buildExperiences', () => {
  it('keeps fixed experiences open or coming soon', () => {
    const experiences = buildExperiences({ adventAllowed: false, trackerAllowed: false, adventStatus: 'waiting', trackerStatus: 'soon' });
    expect(experiences.map(({ id }) => id)).toEqual(['workshop', 'arcade', 'tower', 'cinema', 'music', 'gifts', 'stable', 'observatory']);
    expect(experiences.find(({ id }) => id === 'music')).toMatchObject({ status: 'open', actionLabel: 'Play the music box', statusLabel: 'Open' });
    expect(experiences.find(({ id }) => id === 'cinema')).toMatchObject({ status: 'soon', href: null });
  });

  it('uses the supplied access state for Advent and tracker links', () => {
    const closed = buildExperiences({ adventAllowed: false, trackerAllowed: false, adventStatus: 'waiting', trackerStatus: 'soon' });
    expect(closed.find(({ id }) => id === 'workshop')).toMatchObject({ status: 'waiting', href: null, statusLabel: 'Opens Nov 30' });
    expect(closed.find(({ id }) => id === 'tower')).toMatchObject({ status: 'soon', href: null, statusLabel: 'Dec 24' });

    const open = buildExperiences({ adventAllowed: true, trackerAllowed: true, adventStatus: 'open', trackerStatus: 'open' });
    expect(open.find(({ id }) => id === 'workshop')).toMatchObject({ status: 'open', href: '/advent' });
    expect(open.find(({ id }) => id === 'tower')).toMatchObject({ status: 'open', href: '/tracker', actionLabel: 'Track Santa' });
  });
});
