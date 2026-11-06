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
      <p className="home-card-copy mt-3 min-h-12 text-base leading-7 text-slate-200">{copy}</p>
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
        <section className="home-hero" aria-labelledby="home-title">
          <NorthPoleScene
            label={t('home.heroLabel')}
            windowOnLabel={t('home.windowOn')}
            windowOffLabel={t('home.windowOff')}
          />
          <div className="home-hero-shade" aria-hidden="true" />
          <div className="home-hero-content">
            <header className="home-heading">
              <p className="home-kicker"><span aria-hidden="true">✦</span>{t('home.kicker')}</p>
              <h1 id="home-title">{t('home.title')}</h1>
              <p>{t('home.subtitle')}</p>
            </header>
            <section aria-labelledby="countdown-heading" className="countdown-panel">
              <p className="countdown-ornament" aria-hidden="true">✧ · ✦ · ✧</p>
              <h2 id="countdown-heading">{t('home.countdown')}</h2>
              <CountdownTiles locale={translator.locale} flyingText={t('home.flyingTonight')} />
            </section>
          </div>
          <p className="home-scene-note">{t('home.sceneNote')}</p>
        </section>
        <section aria-label={t('home.destinations')} className="home-cards">
          <article className="home-card">
            <div className="home-card-topline">
              <span className="home-card-index">{t('home.adventIndex')}</span>
              <svg aria-hidden="true" viewBox="0 0 32 32" className="home-card-mark">
                <path d="M7 10.5 16 5l9 5.5v12L16 28l-9-5.5z" />
                <path d="M7.5 11 16 16l8.5-5M16 16v11M16 9v4m-2-2h4" />
              </svg>
            </div>
            <h2>{t('home.adventTitle')}</h2>
            <CardCopy kind="advent" state={cards.advent} allowed={adventAllowed} t={t} />
          </article>
          <article className="home-card">
            <div className="home-card-topline">
              <span className="home-card-index">{t('home.trackerIndex')}</span>
              <svg aria-hidden="true" viewBox="0 0 32 32" className="home-card-mark">
                <path d="M16 4.5 26 9v7.5c0 6-4.2 9.5-10 11-5.8-1.5-10-5-10-11V9z" />
                <path d="M9.5 17h4l2-4 2.5 7 2-3h2.5" />
              </svg>
            </div>
            <h2>{t('home.trackerTitle')}</h2>
            <CardCopy kind="tracker" state={cards.tracker} allowed={trackerAllowed} t={t} />
          </article>
        </section>
        <footer className="home-footer">{t('home.footer')}</footer>
      </main>
    </>
  );
}
