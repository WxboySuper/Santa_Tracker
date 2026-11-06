import { notFound } from 'next/navigation';
import VillageStatic from '@/components/village/village-static';
import VillageExperience from '@/components/village/village-experience';
import { buildExperiences } from '@/components/village/build-experiences';
import { canPreviewDesign, canViewFeature } from '@/lib/access';
import { isAdventEnabled } from '@/lib/config';
import { deriveHomeCards } from '@/lib/home-cards';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'The North Pole Village (preview)' };

export default async function VillagePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  if (!(await canPreviewDesign())) notFound();
  const now = new Date();
  const trackerAllowed = await canViewFeature('tracker', now);
  const adventAllowed = isAdventEnabled() && (await canViewFeature('advent', now));
  const cards = deriveHomeCards({ now, adventAllowed, trackerAllowed });
  const experiences = buildExperiences({
    adventAllowed,
    trackerAllowed,
    adventStatus: adventAllowed ? 'open' : cards.advent.status === 'before' ? 'waiting' : 'soon',
    trackerStatus: trackerAllowed ? 'open' : cards.tracker.status === 'before' ? 'waiting' : 'soon',
  });
  const { view } = await searchParams;
  if (view === 'static') return <VillageStatic experiences={experiences} />;
  return <VillageExperience experiences={experiences} />;
}
