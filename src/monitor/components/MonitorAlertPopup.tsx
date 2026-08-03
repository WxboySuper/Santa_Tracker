import React from 'react';
import { X } from 'lucide-react';
import type { NwsAlertDetails } from '../nwsAlertDetails';
import { formatNwsAlertTime } from '../nwsAlertDetails';

interface MonitorAlertPopupProps {
  details: NwsAlertDetails;
  onClose: () => void;
}

/** Renders one metadata field in the alert details popup when data exists. */
const MetaRow: React.FC<{ label: string; value: string | null }> = ({ label, value }) => {
  if (!value) {
    return null;
  }

  return (
    <div className="monitor-alert-popup__metaRow">
      <span className="monitor-alert-popup__metaLabel">{label}</span>
      <span className="monitor-alert-popup__metaValue">{value}</span>
    </div>
  );
};

/** Displays the selected NWS alert details inside the monitor map overlay. */
const MonitorAlertPopup: React.FC<MonitorAlertPopupProps> = ({ details, onClose }) => {
  const effective = formatNwsAlertTime(details.effective);
  const expires = formatNwsAlertTime(details.expires);

  return (
    <div
      className="monitor-alert-popup"
      role="dialog"
      aria-modal="true"
      aria-label={`${details.event} details`}
    >
      <div className="monitor-alert-popup__header">
        <h3 className="monitor-alert-popup__title">{details.event}</h3>
        <button
          type="button"
          className="monitor-alert-popup__close"
          onClick={onClose}
          aria-label="Close alert details"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {details.headline && (
        <p className="monitor-alert-popup__headline">{details.headline}</p>
      )}

      <div className="monitor-alert-popup__meta">
        <MetaRow label="Area" value={details.areaDesc} />
        <MetaRow label="Severity" value={details.severity} />
        <MetaRow label="Certainty" value={details.certainty} />
        <MetaRow label="Urgency" value={details.urgency} />
        <MetaRow label="Effective" value={effective} />
        <MetaRow label="Expires" value={expires} />
        {details.senderName && (
          <MetaRow label="Issued by" value={details.senderName} />
        )}
      </div>

      {details.description && (
        <section className="monitor-alert-popup__section">
          <h4 className="monitor-alert-popup__sectionTitle">Description</h4>
          <p className="monitor-alert-popup__body">{details.description}</p>
        </section>
      )}

      {details.instruction && (
        <section className="monitor-alert-popup__section">
          <h4 className="monitor-alert-popup__sectionTitle">Instructions</h4>
          <p className="monitor-alert-popup__body">{details.instruction}</p>
        </section>
      )}

      {details.detailUrl && (
        <a
          className="monitor-alert-popup__link"
          href={details.detailUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View full alert on weather.gov
        </a>
      )}
    </div>
  );
};

export default MonitorAlertPopup;
