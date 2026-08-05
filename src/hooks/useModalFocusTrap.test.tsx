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
    const after = screen.getByRole('button', { name: 'After' });
    const before = screen.getByRole('button', { name: 'Before' });
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
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
});
