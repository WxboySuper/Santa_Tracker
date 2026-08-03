import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { DiscussionPage } from './DiscussionPage';
import forecastReducer, { setDiscussionGroupings, setForecastDay } from '../store/forecastSlice';
import overlaysReducer from '../store/overlaysSlice';
import stormReportsReducer from '../store/stormReportsSlice';
import appModeReducer from '../store/appModeSlice';
import themeReducer from '../store/themeSlice';
import verificationReducer from '../store/verificationSlice';

jest.mock('../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useOutletContext: () => ({
    addToast: jest.fn(),
  }),
}));

const mockUseAuth = jest.requireMock('../auth/AuthProvider').useAuth as jest.Mock;

const createStore = () =>
  configureStore({
    reducer: {
      forecast: forecastReducer,
      overlays: overlaysReducer,
      stormReports: stormReportsReducer,
      appMode: appModeReducer,
      theme: themeReducer,
      verification: verificationReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
      }),
  });

describe('DiscussionPage', () => {
  test('uses the synced default forecaster name when no discussion exists yet', () => {
    mockUseAuth.mockReturnValue({
      syncedSettings: {
        defaultForecasterName: 'WeatherboySuper',
      },
      user: {
        displayName: 'Fallback Name',
      },
    });

    render(
      <MemoryRouter>
        <Provider store={createStore()}>
          <DiscussionPage />
        </Provider>
      </MemoryRouter>
    );

    expect(screen.getByDisplayValue('WeatherboySuper')).toBeInTheDocument();
  });

  test('preserves unsaved scope text as a draft when changing grouping', () => {
    mockUseAuth.mockReturnValue({
      syncedSettings: { defaultForecasterName: '' },
      user: { displayName: '' },
    });

    const store = createStore();
    store.dispatch(setDiscussionGroupings([
      { id: 'day-1', label: 'Day 1', days: [1], discussionDay: 1 },
      { id: 'day-2', label: 'Day 2', days: [2], discussionDay: 2 },
    ]));

    render(
      <MemoryRouter>
        <Provider store={store}>
          <DiscussionPage />
        </Provider>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByPlaceholderText(/Write your forecast discussion here/i), {
      target: { value: 'Unsaved scope text' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Discussion scope' }), { target: { value: 'day-2' } });

    const state = store.getState().forecast;
    expect(state.discussionDraftsByScope['day-1']?.diyContent).toBe('Unsaved scope text');
    expect(state.forecastCycle.days[1].discussion).toBeUndefined();
  });

  test('keeps unsaved drafts across unmounts without mixing forecast days', () => {
    mockUseAuth.mockReturnValue({
      syncedSettings: { defaultForecasterName: '' },
      user: { displayName: '' },
    });

    const store = createStore();
    const renderPage = () => render(
      <MemoryRouter>
        <Provider store={store}>
          <DiscussionPage />
        </Provider>
      </MemoryRouter>
    );

    const dayOnePage = renderPage();
    fireEvent.change(screen.getByPlaceholderText(/Write your forecast discussion here/i), {
      target: { value: 'Day 1 draft' },
    });
    dayOnePage.unmount();

    store.dispatch(setForecastDay(2));
    const dayTwoPage = renderPage();
    expect(screen.getByPlaceholderText(/Write your forecast discussion here/i)).toHaveValue('');
    fireEvent.change(screen.getByPlaceholderText(/Write your forecast discussion here/i), {
      target: { value: 'Day 2 draft' },
    });
    dayTwoPage.unmount();

    store.dispatch(setForecastDay(1));
    const restoredDayOnePage = renderPage();
    expect(screen.getByPlaceholderText(/Write your forecast discussion here/i)).toHaveValue('Day 1 draft');
    restoredDayOnePage.unmount();

    store.dispatch(setForecastDay(2));
    renderPage();
    expect(screen.getByPlaceholderText(/Write your forecast discussion here/i)).toHaveValue('Day 2 draft');
  });
});
