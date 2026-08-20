import React from 'react';
import './DrawingTools.css';

interface ToolButtonProps {
  onClick?: () => void;
  disabled: boolean;
  className: string;
  label: string;
  icon: string;
  maintenance?: boolean;
  tooltipText?: React.ReactNode;
}

const ToolButton: React.FC<ToolButtonProps> = ({
  onClick,
  disabled,
  className,
  label,
  icon,
  maintenance,
  tooltipText
}) => (
  <div className="tooltip">
    <button
      className={`tool-button ${className}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={label}
    >
      <span role="img" aria-hidden="true">{icon}</span> {label}
    </button>
    {maintenance && <span className="maintenance-badge">!</span>}
    {tooltipText && (
      <span className="tooltip-text">
        {tooltipText}
      </span>
    )}
  </div>
);

export default ToolButton;
