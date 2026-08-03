import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CompletionHandoff } from './CompletionHandoff';

describe('CompletionHandoff', () => {
  const props = {
    open: true,
    showMonitor: true,
    isDownloading: false,
    onWorkflowExport: jest.fn(),
    onCycleExport: jest.fn(),
    onMonitor: jest.fn(),
    onReturnToMap: jest.fn(),
    onDismiss: jest.fn(),
  };

  it('renders all eligible actions and forwards clicks', () => {
    render(<CompletionHandoff {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /workflow package/i }));
    fireEvent.click(screen.getByRole('button', { name: /complete cycle/i }));
    fireEvent.click(screen.getByRole('button', { name: /open monitor/i }));
    fireEvent.click(screen.getByRole('button', { name: /return to map/i }));
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(props.onWorkflowExport).toHaveBeenCalled();
    expect(props.onCycleExport).toHaveBeenCalled();
    expect(props.onMonitor).toHaveBeenCalled();
    expect(props.onReturnToMap).toHaveBeenCalled();
    expect(props.onDismiss).toHaveBeenCalled();
  });

  it('omits Monitor for unsupported workflows and disables exports while downloading', () => {
    render(<CompletionHandoff {...props} showMonitor={false} isDownloading />);
    expect(screen.queryByRole('button', { name: /open monitor/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /workflow package/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /complete cycle/i })).toBeDisabled();
  });
});
