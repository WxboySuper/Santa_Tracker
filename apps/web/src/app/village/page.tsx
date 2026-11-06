import { notFound } from 'next/navigation';
import VillageExperience, { type Experience } from '@/components/village/village-experience';
import { canPreviewDesign, canViewFeature } from '@/lib/access';
import { isAdventEnabled } from '@/lib/config';
import { deriveHomeCards } from '@/lib/home-cards';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'The North Pole Village (preview)' };

/**
 * A design preview of the immersive North Pole village. It is admin-only while it is being shaped,
 * so it never appears to visitors. The copy is English-only for now and moves to the localization
 * catalogue if the design is adopted.
 */
export default async function VillagePage() {
  if (!(await canPreviewDesign())) notFound();
  const now = new Date();
  const trackerAllowed = await canViewFeature('tracker', now);
  const adventAllowed = isAdventEnabled() && (await canViewFeature('advent', now));
  const cards = deriveHomeCards({ now, adventAllowed, trackerAllowed });
  const adventStatus = adventAllowed ? 'open' : cards.advent.status === 'before' ? 'waiting' : 'soon';
  const trackerStatus = trackerAllowed ? 'open' : cards.tracker.status === 'before' ? 'waiting' : 'soon';

  const experiences: Experience[] = [
    {
      id: 'workshop',
      name: 'The Workshop',
      tagline: 'Where the night shift keeps the lights on.',
      blurb: 'The old workshop never really closes. Wren, Bellamy and the Ledger take turns minding the desk, and their story unfolds one door at a time through the Advent calendar.',
      status: adventStatus,
      href: adventAllowed ? '/advent' : null,
      actionLabel: adventAllowed ? 'Read the story in Advent' : 'Opens with the Advent calendar',
      statusLabel: adventAllowed ? 'Open' : 'Opens Nov 30',
    },
    {
      id: 'arcade',
      name: 'The Arcade',
      tagline: 'A new door every day.',
      blurb: 'Twenty-four doors: puzzles, a jigsaw, a snowflake maker, a maze, a quiz and a few small surprises. The first one opens on December 1 at noon UTC.',
      status: adventStatus,
      href: adventAllowed ? '/advent' : null,
      actionLabel: adventAllowed ? 'Open the calendar' : 'Opens Nov 30',
      statusLabel: adventAllowed ? 'Open' : 'Opens Nov 30',
    },
    {
      id: 'tower',
      name: 'The Control Tower',
      tagline: 'Watch the sleigh, live.',
      blurb: 'On Christmas Eve the dish starts turning and the whole route lights up on the map. Immersive mode follows him stop by stop; TV mode is made for a living-room screen.',
      status: trackerStatus,
      href: trackerAllowed ? '/tracker' : null,
      actionLabel: trackerAllowed ? 'Track Santa' : 'Takes off Dec 24, 10:00 UTC',
      statusLabel: trackerAllowed ? 'Open' : 'Dec 24',
    },
    {
      id: 'cinema',
      name: 'The Cinema',
      tagline: 'A quiet little screening room.',
      blurb: 'A few short, cosy films are planned for the long evenings. The projector is warming up.',
      status: 'soon',
      href: null,
      actionLabel: 'Coming soon',
      statusLabel: 'Coming soon',
    },
    {
      id: 'music',
      name: 'The Music Hall',
      tagline: 'Carols, played softly.',
      blurb: 'A music box with a handful of old carols: Jingle Bells, We Wish You a Merry Christmas and Deck the Halls. Press play and look around while it plays.',
      status: 'open',
      href: null,
      actionLabel: 'Play the music box',
      statusLabel: 'Open',
    },
    {
      id: 'gifts',
      name: 'The Gift Shop',
      tagline: 'Postcards for faraway people.',
      blurb: 'Nothing here costs a thing. The postcard studio is waiting on Day 23 of the calendar, and more small gifts are on the shelf for later.',
      status: adventStatus,
      href: adventAllowed ? '/advent' : null,
      actionLabel: adventAllowed ? 'See the calendar' : 'Opens with Advent',
      statusLabel: 'Coming soon',
    },
    {
      id: 'stable',
      name: 'The Stable',
      tagline: 'Dasher, Dancer, Prancer, Vixen, Comet, Cupid, Donner, Blitzen. And Rudolph.',
      blurb: 'Nine reindeer, one very patient stable hand, and a hay bale that has seen things. Introductions are coming before the big night.',
      status: 'soon',
      href: null,
      actionLabel: 'Coming soon',
      statusLabel: 'Coming soon',
    },
    {
      id: 'observatory',
      name: 'The Observatory',
      tagline: 'The long night, up close.',
      blurb: 'A telescope pointed at the aurora and the longest night of the year. What you can see tonight, and why the dark is so generous in December.',
      status: 'soon',
      href: null,
      actionLabel: 'Coming soon',
      statusLabel: 'Coming soon',
    },
  ];

  return <VillageExperience experiences={experiences} />;
}
