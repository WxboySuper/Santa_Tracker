import type { NwsAlertDetails } from '../nwsAlertDetails';
import { formatNwsAlertTime } from '../nwsAlertDetails';

/** Clears imperative alert popup content from an OpenLayers overlay container. */
export const clearMonitorAlertPopup = (container: HTMLElement): void => {
  container.replaceChildren();
};

/** Appends a labeled metadata row when `value` is present. */
const appendMetaRow = (
  parent: HTMLElement,
  label: string,
  value: string | null,
): void => {
  if (!value) {
    return;
  }

  const row = document.createElement('div');
  row.className = 'monitor-alert-popup__metaRow';

  const labelEl = document.createElement('span');
  labelEl.className = 'monitor-alert-popup__metaLabel';
  labelEl.textContent = label;

  const valueEl = document.createElement('span');
  valueEl.className = 'monitor-alert-popup__metaValue';
  valueEl.textContent = value;

  row.appendChild(labelEl);
  row.appendChild(valueEl);
  parent.appendChild(row);
};

/** Appends a titled description or instruction block to the popup. */
const appendSection = (
  parent: HTMLElement,
  title: string,
  body: string,
): void => {
  const section = document.createElement('section');
  section.className = 'monitor-alert-popup__section';

  const heading = document.createElement('h4');
  heading.className = 'monitor-alert-popup__sectionTitle';
  heading.textContent = title;

  const paragraph = document.createElement('p');
  paragraph.className = 'monitor-alert-popup__body';
  paragraph.textContent = body;

  section.appendChild(heading);
  section.appendChild(paragraph);
  parent.appendChild(section);
};

/**
 * Renders NWS alert details into an OpenLayers overlay element without React.
 * Returns a cleanup function that removes the close-button listener.
 */
export const renderMonitorAlertPopup = (
  container: HTMLElement,
  details: NwsAlertDetails,
  onClose: () => void,
): (() => void) => {
  clearMonitorAlertPopup(container);

  const dialog = document.createElement('div');
  dialog.className = 'monitor-alert-popup';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', `${details.event} details`);

  const header = document.createElement('div');
  header.className = 'monitor-alert-popup__header';

  const title = document.createElement('h3');
  title.className = 'monitor-alert-popup__title';
  title.textContent = details.event;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'monitor-alert-popup__close';
  closeButton.setAttribute('aria-label', 'Close alert details');
  closeButton.textContent = '×';

  closeButton.addEventListener('click', onClose);

  header.appendChild(title);
  header.appendChild(closeButton);
  dialog.appendChild(header);

  if (details.headline) {
    const headline = document.createElement('p');
    headline.className = 'monitor-alert-popup__headline';
    headline.textContent = details.headline;
    dialog.appendChild(headline);
  }

  const meta = document.createElement('div');
  meta.className = 'monitor-alert-popup__meta';
  appendMetaRow(meta, 'Area', details.areaDesc);
  appendMetaRow(meta, 'Severity', details.severity);
  appendMetaRow(meta, 'Certainty', details.certainty);
  appendMetaRow(meta, 'Urgency', details.urgency);
  appendMetaRow(meta, 'Effective', formatNwsAlertTime(details.effective));
  appendMetaRow(meta, 'Expires', formatNwsAlertTime(details.expires));
  appendMetaRow(meta, 'Issued by', details.senderName);
  dialog.appendChild(meta);

  if (details.description) {
    appendSection(dialog, 'Description', details.description);
  }

  if (details.instruction) {
    appendSection(dialog, 'Instructions', details.instruction);
  }

  if (details.detailUrl) {
    const link = document.createElement('a');
    link.className = 'monitor-alert-popup__link';
    link.href = details.detailUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View full alert on weather.gov';
    dialog.appendChild(link);
  }

  container.appendChild(dialog);

  return () => {
    closeButton.removeEventListener('click', onClose);
  };
};
