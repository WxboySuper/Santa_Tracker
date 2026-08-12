import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { v17Update } from '../content/updates/v1.7';
import type { UpdateScreenshot } from '../content/updates/types';
import './UpdatesPage.css';

interface UpdateImageLightboxProps {
  shot: UpdateScreenshot;
  onClose: () => void;
}

/** Full-screen preview for a release screenshot. */
function UpdateImageLightbox({ shot, onClose }: UpdateImageLightboxProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return undefined;
    }

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    /** Sync parent state when the native dialog closes. */
    const handleClose = () => onCloseRef.current();
    dialog.addEventListener('close', handleClose);

    return () => {
      dialog.removeEventListener('close', handleClose);
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="updates-page__lightbox"
      aria-labelledby="updates-lightbox-title"
      aria-describedby="updates-lightbox-caption"
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          dialogRef.current?.close();
        }
      }}
    >
      <div className="updates-page__lightbox-panel">
        <button
          type="button"
          className="updates-page__lightbox-close"
          aria-label="Close enlarged image"
          onClick={() => dialogRef.current?.close()}
        >
          Close
        </button>
        <h2 id="updates-lightbox-title" className="updates-page__lightbox-title">
          Enlarged preview
        </h2>
        <img
          className="updates-page__lightbox-image"
          src={shot.src}
          alt={shot.alt}
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
        <p id="updates-lightbox-caption" className="updates-page__lightbox-caption">
          {shot.caption ?? shot.alt}
        </p>
      </div>
    </dialog>
  );
}

interface UpdateScreenshotFigureProps {
  shot: UpdateScreenshot;
  onExpand: (shot: UpdateScreenshot) => void;
  /** Optional test hook; passed for hero promo images only. */
  testid?: string;
}

/** Renders a release screenshot when the asset exists under public/updates. */
function UpdateScreenshotFigure({ shot, onExpand, testid }: UpdateScreenshotFigureProps) {
  const [visible, setVisible] = useState(true);

  if (!visible) {
    return null;
  }

  return (
    <figure className="updates-page__figure">
      <button
        type="button"
        className="updates-page__figure-button"
        onClick={() => onExpand(shot)}
        aria-label={`View larger: ${shot.alt}`}
      >
        <img src={shot.src} alt="" loading="lazy" onError={() => setVisible(false)} data-testid={testid} />
        <span className="updates-page__figure-hint" aria-hidden="true">
          Click to enlarge
        </span>
      </button>
      {shot.caption ? <figcaption>{shot.caption}</figcaption> : null}
    </figure>
  );
}

interface UpdateContentProps {
  onExpand: (shot: UpdateScreenshot) => void;
}

function UpdateMasthead({ onExpand }: UpdateContentProps) {
  return (
    <header className="updates-page__masthead">
      <div className="updates-page__masthead-copy">
        <p className="updates-page__eyebrow">Release briefing · v{v17Update.version}</p>
        <h1>{v17Update.title}</h1>
        <p className="updates-page__summary">{v17Update.summary}</p>
        <div className="updates-page__masthead-meta" aria-label="Release highlights">
          <span><strong>2</strong> headline features</span>
          <span><strong>4</strong> new release stories</span>
          <span><strong>1</strong> privacy update</span>
        </div>
      </div>
      {v17Update.heroImage ? (
        <UpdateScreenshotFigure shot={v17Update.heroImage} onExpand={onExpand} testid="updates-hero-image" />
      ) : null}
    </header>
  );
}

function UpdatePromoImages({ onExpand }: UpdateContentProps) {
  if (!v17Update.promoImages?.length) {
    return null;
  }

  return (
    <div className="updates-page__promo">
      {v17Update.promoImages.map((shot) => (
        <UpdateScreenshotFigure key={shot.src} shot={shot} onExpand={onExpand} testid="updates-promo-image" />
      ))}
    </div>
  );
}

function UpdateReleaseSection({ section, onExpand }: UpdateContentProps & { section: (typeof v17Update.sections)[number] }) {
  return (
    <section key={section.title} className={`updates-page__section updates-page__section--${section.kind ?? 'support'}`}>
      <div className="updates-page__section-heading">
        {section.eyebrow ? <p className="updates-page__section-eyebrow">{section.eyebrow}</p> : null}
        <h2>{section.title}</h2>
      </div>
      <div className="updates-page__section-content">
        <p>{section.body}</p>
        {section.bullets?.length ? (
          <ul className="updates-page__bullet-list">
            {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
          </ul>
        ) : null}
        {section.link ? <Link className="updates-page__section-link" to={section.link.href}>{section.link.label}<span aria-hidden="true">↗</span></Link> : null}
      </div>
      {section.screenshots?.length ? (
        <div className="updates-page__shots">
          {section.screenshots.map((shot) => (
            <UpdateScreenshotFigure key={shot.src} shot={shot} onExpand={onExpand} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function UpdateReleaseNotes() {
  return (
    <section className="updates-page__improvements" aria-labelledby="updates-improvements-heading">
      <div>
        <p className="updates-page__section-label">Release notes</p>
        <h2 id="updates-improvements-heading">Also improved</h2>
      </div>
      <ul>
        {v17Update.improvements.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
    </section>
  );
}

function UpdateHotfixes() {
  if (!v17Update.hotfixes) {
    return null;
  }

  return (
    <section className="updates-page__hotfixes" aria-labelledby="updates-hotfixes-heading">
      <h2 id="updates-hotfixes-heading">{v17Update.hotfixes.title}</h2>
      <p>{v17Update.hotfixes.body}</p>
      <ul>
        {v17Update.hotfixes.items.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
    </section>
  );
}

function UpdateReleaseContent({ onExpand }: UpdateContentProps) {
  return (
    <div className="updates-page__inner">
      <UpdateMasthead onExpand={onExpand} />
      <UpdatePromoImages onExpand={onExpand} />

      <div className="updates-page__section-intro">
        <p className="updates-page__section-label">What shipped</p>
        <h2>Two reasons to open GFC today.</h2>
        <p>Verification v2 is where the learning loop lands. Custom Products is where the forecast becomes yours. Everything else in v1.7 supports those two ideas: make better work, then understand it.</p>
      </div>

      <div className="updates-page__sections">
        {v17Update.sections.map((section) => (
          <UpdateReleaseSection key={section.title} section={section} onExpand={onExpand} />
        ))}
      </div>

      <UpdateHotfixes />
      <UpdateReleaseNotes />

      <Link className="updates-page__back" to="/">
        Back to home
      </Link>
    </div>
  );
}

/** Public What's New page for the current major release. */
export const UpdatesPage: React.FC = () => {
  const [expandedShot, setExpandedShot] = useState<UpdateScreenshot | null>(null);
  const closeLightbox = useCallback(() => setExpandedShot(null), []);

  return (
    <div className="updates-page">
      <UpdateReleaseContent onExpand={setExpandedShot} />

      {expandedShot ? (
        <UpdateImageLightbox shot={expandedShot} onClose={closeLightbox} />
      ) : null}
    </div>
  );
};

export default UpdatesPage;
