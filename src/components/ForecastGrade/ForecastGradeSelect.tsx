import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface ForecastGradeSelectOption {
  value: string;
  label: string;
}

interface ForecastGradeSelectProps {
  value: string;
  options: ForecastGradeSelectOption[];
  ariaLabel: string;
  onChange: (value: string) => void;
  className?: string;
}

const SELECT_OPEN_EVENT = 'gfc-forecast-select-open';

/** A compact, keyboard-friendly menu used by the verification workbench. */
const ForecastGradeSelect: React.FC<ForecastGradeSelectProps> = ({
  value,
  options,
  ariaLabel,
  onChange,
  className = '',
}) => {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    const closeWhenAnotherOpens = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== id) {
        setOpen(false);
      }
    };
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener(SELECT_OPEN_EVENT, closeWhenAnotherOpens);
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener(SELECT_OPEN_EVENT, closeWhenAnotherOpens);
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [id]);

  const toggle = () => {
    if (!open) {
      document.dispatchEvent(new CustomEvent(SELECT_OPEN_EVENT, { detail: id }));
    }
    setOpen((current) => !current);
  };

  return (
    <div ref={rootRef} className={`fg-select ${open ? 'is-open' : ''} ${className}`}>
      <button
        type="button"
        className="fg-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        aria-label={ariaLabel}
        onClick={toggle}
      >
        <span>{selected?.label ?? 'Select'}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div id={`${id}-options`} className="fg-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className="fg-select-option"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {option.value === value && <Check aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ForecastGradeSelect;
