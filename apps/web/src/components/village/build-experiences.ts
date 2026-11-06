import type { BuildingId } from './village-buildings';

export type ExperienceStatus = 'open' | 'soon' | 'waiting';
export type Experience = {
  id: BuildingId;
  name: string;
  tagline: string;
  blurb: string;
  status: ExperienceStatus;
  href: string | null;
  actionLabel: string;
  statusLabel: string;
};

export type ExperienceContext = {
  adventAllowed: boolean;
  trackerAllowed: boolean;
  adventStatus: ExperienceStatus;
  trackerStatus: ExperienceStatus;
};

function chooseByAccess<T>(allowed: boolean, open: T, closed: T): T {
  return allowed ? open : closed;
}

export function buildExperiences({ adventAllowed, trackerAllowed, adventStatus, trackerStatus }: ExperienceContext): Experience[] {
  return [
    {
      id: 'workshop', name: 'The Workshop', tagline: 'Where the night shift keeps the lights on.',
      blurb: 'The old workshop never really closes. Wren, Bellamy and the Ledger take turns minding the desk, and their story unfolds one door at a time through the Advent calendar.',
      status: adventStatus, href: chooseByAccess(adventAllowed, '/advent', null),
      actionLabel: chooseByAccess(adventAllowed, 'Read the story in Advent', 'Opens with the Advent calendar'),
      statusLabel: chooseByAccess(adventAllowed, 'Open', 'Opens Nov 30'),
    },
    {
      id: 'arcade', name: 'The Arcade', tagline: 'A new door every day.',
      blurb: 'Twenty-four doors: puzzles, a jigsaw, a snowflake maker, a maze, a quiz and a few small surprises. The first one opens on December 1 at noon UTC.',
      status: adventStatus, href: chooseByAccess(adventAllowed, '/advent', null),
      actionLabel: chooseByAccess(adventAllowed, 'Open the calendar', 'Opens Nov 30'), statusLabel: chooseByAccess(adventAllowed, 'Open', 'Opens Nov 30'),
    },
    {
      id: 'tower', name: 'The Control Tower', tagline: 'Watch the sleigh, live.',
      blurb: 'On Christmas Eve the dish starts turning and the whole route lights up on the map. Immersive mode follows him stop by stop; TV mode is made for a living-room screen.',
      status: trackerStatus, href: chooseByAccess(trackerAllowed, '/tracker', null),
      actionLabel: chooseByAccess(trackerAllowed, 'Track Santa', 'Takes off Dec 24, 10:00 UTC'), statusLabel: chooseByAccess(trackerAllowed, 'Open', 'Dec 24'),
    },
    {
      id: 'cinema', name: 'The Cinema', tagline: 'A quiet little screening room.',
      blurb: 'A few short, cosy films are planned for the long evenings. The projector is warming up.',
      status: 'soon', href: null, actionLabel: 'Coming soon', statusLabel: 'Coming soon',
    },
    {
      id: 'music', name: 'The Music Hall', tagline: 'Carols, played softly.',
      blurb: 'A music box with a handful of old carols: Jingle Bells, We Wish You a Merry Christmas and Deck the Halls. Press play and look around while it plays.',
      status: 'open', href: null, actionLabel: 'Play the music box', statusLabel: 'Open',
    },
    {
      id: 'gifts', name: 'The Gift Shop', tagline: 'Postcards for faraway people.',
      blurb: 'Nothing here costs a thing. The postcard studio is waiting on Day 23 of the calendar, and more small gifts are on the shelf for later.',
      status: adventStatus, href: chooseByAccess(adventAllowed, '/advent', null),
      actionLabel: chooseByAccess(adventAllowed, 'See the calendar', 'Opens with Advent'), statusLabel: chooseByAccess(adventAllowed, 'Open', 'Opens Nov 30'),
    },
    {
      id: 'stable', name: 'The Stable', tagline: 'Dasher, Dancer, Prancer, Vixen, Comet, Cupid, Donner, Blitzen. And Rudolph.',
      blurb: 'Nine reindeer, one very patient stable hand, and a hay bale that has seen things. Introductions are coming before the big night.',
      status: 'soon', href: null, actionLabel: 'Coming soon', statusLabel: 'Coming soon',
    },
    {
      id: 'observatory', name: 'The Observatory', tagline: 'The long night, up close.',
      blurb: 'A telescope pointed at the aurora and the longest night of the year. What you can see tonight, and why the dark is so generous in December.',
      status: 'soon', href: null, actionLabel: 'Coming soon', statusLabel: 'Coming soon',
    },
  ];
}
