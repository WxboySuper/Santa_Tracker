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

/** Public What's New page for the current major release. */
export const UpdatesPage: React.FC = () => {
  const [expandedShot, setExpandedShot] = useState<UpdateScreenshot | null>(null);
  const closeLightbox = useCallback(() => setExpandedShot(null), []);

  return (
    <div className="updates-page">
      <div className="updates-page__inner">
        <p className="updates-page__eyebrow">What&apos;s new · v{v17Update.version}</p>
        <h1>{v17Update.title}</h1>
        <p className="updates-page__summary">{v17Update.summary}</p>

        {v17Update.promoImages?.length ? (
          <div className="updates-page__promo">
            {v17Update.promoImages.map((shot) => (
              <UpdateScreenshotFigure key={shot.src} shot={shot} onExpand={setExpandedShot} testid="updates-promo-image" />
            ))}
          </div>
        ) : null}

        {v17Update.sections.map((section) => (
          <section key={section.title} className="updates-page__section">
            <h2>{section.title}</h2>
            <p>{section.body}</p>
            {section.screenshots?.length ? (
              <div className="updates-page__shots">
                {section.screenshots.map((shot) => (
                  <UpdateScreenshotFigure key={shot.src} shot={shot} onExpand={setExpandedShot} />
                ))}
              </div>
            ) : null}
          </section>
        ))}

        {v17Update.hotfixes ? (
          <section className="updates-page__hotfixes" aria-labelledby="updates-hotfixes-heading">
            <h2 id="updates-hotfixes-heading">{v17Update.hotfixes.title}</h2>
            <p>{v17Update.hotfixes.body}</p>
            <ul>
              {v17Update.hotfixes.items.map((item) => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="updates-page__improvements" aria-labelledby="updates-improvements-heading">
          <h2 id="updates-improvements-heading">Also improved</h2>
          <ul>
            {v17Update.improvements.map((item) => (
              <li key={item.id}>{item.text}</li>
            ))}
          </ul>
        </section>

        <Link className="updates-page__back" to="/">
          Back to home
        </Link>
      </div>

      {expandedShot ? (
        <UpdateImageLightbox shot={expandedShot} onClose={closeLightbox} />
      ) : null}
    </div>
  );
};

export default UpdatesPage;
