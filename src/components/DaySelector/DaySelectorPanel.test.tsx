import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import DaySelectorPanel, { getForecastDayFromDigitKeyDown } from './DaySelectorPanel';
import forecastReducer from '../../store/forecastSlice';
import type { OutlookDay } from '../../types/outlooks';

jest.mock('../Layout', () => ({
  FloatingPanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('../ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
}));

jest.mock('../ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

jest.mock('../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => children,
  TooltipContent: ({ children }: { children: React.ReactNode }) => children,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => children,
}));

const makeOutlookDay = (day: OutlookDay['day'], data: OutlookDay['data']): OutlookDay => ({
  day,
  data,
  metadata: {
    issueDate: '2026-03-27T06:00:00Z',
    validDate: '2026-03-27T06:00:00Z',
    issuanceTime: '0600',
    createdAt: '2026-03-27T06:00:00Z',
    lastModified: '2026-03-27T06:00:00Z',
    lowProbabilityOutlooks: [],
  },
});

const buildStore = (currentDay: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 = 2) => {
  const baseForecastState = forecastReducer(undefined, { type: '@@INIT' });
  const forecastState = {
    ...baseForecastState,
    forecastCycle: {
      ...baseForecastState.forecastCycle,
      cycleDate: '2026-03-27',
      currentDay,
      days: {
        1: makeOutlookDay(1, { categorical: new Map([['cat', []]]) }),
        2: makeOutlookDay(2, { tornado: new Map([['tornado', []]]) }),
        4: makeOutlookDay(4, { 'day4-8': new Map([['day4', []]]) }),
      },
    },
  };

  return configureStore({
    reducer: { forecast: forecastReducer },
    preloadedState: { forecast: forecastState },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });
};

describe('DaySelectorPanel', () => {
  test('shows the active day, date and data markers', () => {
    const store = buildStore(2);

    render(
      <Provider store={store}>
        <DaySelectorPanel />
      </Provider>
    );

    expect(screen.getByText(new Date('2026-03-27').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2' })).toHaveClass('bg-primary');
    expect(screen.getByText('Tornado, Wind, Hail, Categorical', { selector: 'div.text-center' })).toHaveTextContent('Tornado, Wind, Hail, Categorical');
    expect(screen.getAllByText('', { selector: 'span.bg-success' })).toHaveLength(3);
  });

  test('supports day changes, date editing and keyboard shortcuts', () => {
    const store = buildStore(1);
    render(
      <Provider store={store}>
        <DaySelectorPanel />
      </Provider>
    );

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    const dateInput = screen.getByDisplayValue('2026-03-27') as HTMLInputElement;
    expect(dateInput).toHaveValue('2026-03-27');

    fireEvent.change(dateInput, { target: { value: '2026-04-01' } });
    fireEvent.click(screen.getByRole('button', { name: '✓' }));
    expect(store.getState().forecast.forecastCycle.cycleDate).toBe('2026-04-01');
    expect(screen.getByText(new Date('2026-04-01').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }))).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '5' });
    expect(store.getState().forecast.forecastCycle.currentDay).toBe(5);

    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(store.getState().forecast.forecastCycle.currentDay).toBe(4);

    fireEvent.click(buttons[1]);
    expect(store.getState().forecast.forecastCycle.currentDay).toBe(3);
    expect(screen.getByText('Total Severe, Categorical', { selector: 'div.text-center' })).toHaveTextContent('Total Severe, Categorical');

    fireEvent.click(buttons[buttons.length - 1]);
    expect(store.getState().forecast.forecastCycle.currentDay).toBe(4);
    expect(screen.getByText('15% and 30% only', { selector: 'div.text-center' })).toHaveTextContent('15% and 30% only');
  });
});

describe('getForecastDayFromDigitKeyDown', () => {
  it('returns null when the browser omits KeyboardEvent.key', () => {
    const event = new KeyboardEvent('keydown', { bubbles: true });
    Object.defineProperty(event, 'key', { value: undefined });

    expect(getForecastDayFromDigitKeyDown(event)).toBeNull();
  });

  it('returns the matching day for digit keys 1-8', () => {
    expect(getForecastDayFromDigitKeyDown(new KeyboardEvent('keydown', { key: '3' }))).toBe(3);
  });
});
