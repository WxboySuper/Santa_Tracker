import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface MonitorControlsSectionProps {
  id: string;
  title: React.ReactNode;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

/** Provides a collapsible section shell for monitor control groups. */
const MonitorControlsSection: React.FC<MonitorControlsSectionProps> = ({
  id,
  title,
  defaultCollapsed = false,
  children,
}) => {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const panelId = `monitor-controls-panel-${id}`;

  return (
    <section
      className={`monitor-controls__section${collapsed ? ' monitor-controls__section--collapsed' : ''}`}
    >
      <button
        type="button"
        className="monitor-controls__sectionToggle"
        aria-label={`Toggle ${id} controls`}
        aria-expanded={!collapsed}
        aria-controls={panelId}
        onClick={() => setCollapsed((value) => !value)}
      >
        <span className="monitor-controls__sectionTitle">{title}</span>
        {collapsed ? (
          <ChevronDown className="monitor-controls__sectionChevron" aria-hidden="true" />
        ) : (
          <ChevronUp className="monitor-controls__sectionChevron" aria-hidden="true" />
        )}
      </button>
      {!collapsed ? (
        <div id={panelId} className="monitor-controls__sectionBody">
          {children}
        </div>
      ) : null}
    </section>
  );
};

export default MonitorControlsSection;
