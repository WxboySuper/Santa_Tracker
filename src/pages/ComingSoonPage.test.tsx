import { act, render, screen } from '@testing-library/react';
import { ComingSoonPage } from './ComingSoonPage';

describe('ComingSoonPage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-28T18:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders the countdown and risk badges before launch', () => {
    render(<ComingSoonPage />);

    expect(screen.getByText('Graphical Forecast Creator')).toBeInTheDocument();
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('Days')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('TSTM')).toBeInTheDocument();
  });

  it('updates the countdown interval and switches to launch message', () => {
    jest.setSystemTime(new Date('2026-03-01T17:59:59.000Z'));
    render(<ComingSoonPage />);

    expect(screen.getByText('01')).toBeInTheDocument();

    act(() => {
      jest.setSystemTime(new Date('2026-03-01T18:00:00.000Z'));
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText('GFC is live! Refresh to start forecasting.')).toBeInTheDocument();
  });

  it('renders the launch message immediately after launch', () => {
    jest.setSystemTime(new Date('2026-03-02T18:00:00.000Z'));

    render(<ComingSoonPage />);

    expect(screen.getByText('GFC is live! Refresh to start forecasting.')).toBeInTheDocument();
    expect(screen.queryByText('Days')).not.toBeInTheDocument();
  });
});
