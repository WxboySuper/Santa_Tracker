import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useModalFocusTrap } from './useModalFocusTrap';

interface HarnessProps {
  onClose?: () => void;
}

const FocusTrapHarness: React.FC<HarnessProps> = ({ onClose }) => {
  const { setModalRef } = useModalFocusTrap({ active: true, onClose });
  return (
    <div>
      <button type="button">Before</button>
      <div ref={setModalRef} role="dialog" aria-modal="true" aria-label="Test dialog">
        <button type="button">First</button>
        <button type="button">Last</button>
      </div>
      <button type="button">After</button>
    </div>
  );
};

interface ToggleHarnessProps {
  onClose?: () => void;
}

/** Harness that opens and closes the trap to exercise restore behavior. */
const ToggleFocusTrapHarness: React.FC<ToggleHarnessProps> = ({ onClose }) => {
  const [open, setOpen] = React.useState(false);
  const { setModalRef } = useModalFocusTrap({ active: open, onClose: () => { setOpen(false); onClose?.(); } });
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      {open && (
        <div ref={setModalRef} role="dialog" aria-modal="true" aria-label="Toggle dialog">
          <button type="button">Inside</button>
        </div>
      )}
    </div>
  );
};

describe('useModalFocusTrap', () => {
  it('moves focus into the modal on mount', () => {
    render(<FocusTrapHarness />);
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
  });

  it('wraps Tab focus from the last element back to the first', () => {
    render(<FocusTrapHarness />);
    const last = screen.getByRole('button', { name: 'Last' });
    const first = screen.getByRole('button', { name: 'First' });
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(first).toHaveFocus();
  });

  it('wraps Shift+Tab focus from the first element back to the last', () => {
    render(<FocusTrapHarness />);
    const last = screen.getByRole('button', { name: 'Last' });
    const first = screen.getByRole('button', { name: 'First' });
    first.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('does not move focus to elements outside the modal', () => {
    render(<FocusTrapHarness />);
    const dialog = screen.getByRole('dialog');
    const buttons = Array.from(dialog.parentElement?.querySelectorAll('button') ?? []);
    const after = buttons.find((b) => b.textContent === 'After');
    const before = buttons.find((b) => b.textContent === 'Before');
    const last = buttons.find((b) => b.textContent === 'Last');
    last?.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(after).not.toHaveFocus();
    expect(before).not.toHaveFocus();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = jest.fn();
    render(<FocusTrapHarness onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('hides background siblings but never the modal subtree', () => {
    render(<FocusTrapHarness />);
    const dialog = screen.getByRole('dialog');
    const buttons = Array.from(dialog.parentElement?.querySelectorAll('button') ?? []);
    const beforeButton = buttons.find((b) => b.textContent === 'Before');
    const afterButton = buttons.find((b) => b.textContent === 'After');

    expect(dialog).not.toHaveAttribute('aria-hidden');
    expect(beforeButton?.getAttribute('aria-hidden')).toBe('true');
    expect(afterButton?.getAttribute('aria-hidden')).toBe('true');
  });

  it('restores background aria-hidden on close', () => {
    const { getByRole, queryByRole, container } = render(<ToggleFocusTrapHarness />);
    const openButton = getByRole('button', { name: 'Open' });
    fireEvent.click(openButton);
    const dialog = getByRole('dialog');
    const containerEl = dialog.parentElement as HTMLElement;
    expect(dialog).not.toHaveAttribute('aria-hidden');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(queryByRole('dialog')).toBeNull();
    expect(containerEl.querySelector('button')).not.toHaveAttribute('aria-hidden');
    expect(container).toBeTruthy();
  });
});
