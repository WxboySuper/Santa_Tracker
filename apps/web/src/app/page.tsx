import Link from 'next/link';
import { createTranslator } from '@santa-tracker/localization';
import CountdownTiles from '@/components/countdown-tiles';
import NorthPoleScene from '@/components/north-pole-scene';
import { canViewFeature } from '@/lib/access';
import { deriveHomeCards, type HomeCardState } from '@/lib/home-cards';
import { isAdventEnabled } from '@/lib/config';
import { getRequestLocale } from '@/lib/request-locale';

export const dynamic = 'force-dynamic';

type Translate = ReturnType<typeof createTranslator>['t'];
type CardKind = 'advent' | 'tracker';

function adventCopy(state: HomeCardState, t: Translate): string {
  if (state.status === 'before') return t('home.adventBefore');
  if (state.status === 'after') return t('home.adventAfter');
  if (state.day) return t('home.adventOpen', { day: state.day });
  if (state.phase === 'before-doors') return t('home.adventFirstDoor');
  if (state.phase === 'after-doors') return t('home.adventDone');
  if (state.phase === 'hidden') return t('home.adventTeaser');
  return t('home.adventWaiting');
}

function trackerCopy(state: HomeCardState, allowed: boolean, t: Translate): string {
  if (state.status === 'before') return t('home.trackerBefore');
  if (state.status === 'after') return t('home.trackerAfter');
  return allowed ? t('home.trackerOpen') : t('home.trackerWaiting');
}

function cardCopy(kind: CardKind, state: HomeCardState, allowed: boolean, t: Translate): string {
  return kind === 'advent' ? adventCopy(state, t) : trackerCopy(state, allowed, t);
}

function CardCopy({
  kind,
  state,
  allowed,
  t,
}: {
  kind: CardKind;
  state: HomeCardState;
  allowed: boolean;
  t: Translate;
}) {
  const copy = cardCopy(kind, state, allowed, t);
  const href = kind === 'advent' ? '/advent' : '/tracker';
  const label = kind === 'advent' ? t('home.openCalendar') : t('home.openTracker');
  return (
    <>
      <p className="mt-3 min-h-12 text-base leading-7 text-slate-200">{copy}</p>
      {allowed && (
        <Link className="home-link mt-5 inline-flex rounded-lg px-4 py-2 font-semibold" href={href}>
          {label}
          <span aria-hidden="true" className="ml-2">
            →
          </span>
        </Link>
      )}
    </>
  );
}

export default async function HomePage() {
  const translator = createTranslator({ locale: await getRequestLocale() });
  const now = new Date();
  const trackerAllowed = await canViewFeature('tracker', now);
  const adventAllowed = isAdventEnabled() && (await canViewFeature('advent', now));
  const cards = deriveHomeCards({ now, adventAllowed, trackerAllowed });
  const t = translator.t;
  return (
    <>
      <a className="skip-link" href="#main">
        {t('home.skip')}
      </a>
      <nav aria-label={t('nav.home')} className="home-nav">
        <Link href="/" aria-current="page">
          {t('nav.home')}
        </Link>
      </nav>
      <main id="main" className="home-main">
        <NorthPoleScene label={t('home.heroLabel')} />
        <header className="home-heading">
          <p className="home-kicker">{t('home.kicker')}</p>
          <h1>{t('home.title')}</h1>
          <p>{t('home.subtitle')}</p>
        </header>
        <section aria-labelledby="countdown-heading" className="countdown-panel">
          <h2 id="countdown-heading">{t('home.countdown')}</h2>
          <CountdownTiles locale={translator.locale} flyingText={t('home.flyingTonight')} />
        </section>
        <section aria-label={t('home.destinations')} className="home-cards">
          <article className="home-card">
            <p className="home-card-index">{t('home.adventIndex')}</p>
            <h2>{t('home.adventTitle')}</h2>
            <CardCopy kind="advent" state={cards.advent} allowed={adventAllowed} t={t} />
          </article>
          <article className="home-card">
            <p className="home-card-index">{t('home.trackerIndex')}</p>
            <h2>{t('home.trackerTitle')}</h2>
            <CardCopy kind="tracker" state={cards.tracker} allowed={trackerAllowed} t={t} />
          </article>
        </section>
        <footer className="home-footer">{t('home.footer')}</footer>
      </main>
    </>
  );
}
