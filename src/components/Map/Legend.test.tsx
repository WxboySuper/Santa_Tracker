import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import forecastReducer, { addCustomLayer, setCustomEditorMode } from '../../store/forecastSlice';
import { CUSTOM_PRODUCTS_SCHEMA_VERSION } from '../../types/customProducts';
import { asCustomLayerId } from '../../lib/customProducts';
import themeReducer from '../../store/themeSlice';
import Legend from './Legend';

const createMockStore = (preloadedState = {}) =>
  configureStore({
    reducer: {
      forecast: forecastReducer,
      theme: themeReducer,
    },
    preloadedState,
  });

const renderSevereLegend = (
  activeOutlookType: 'categorical' | 'tornado' | 'wind' | 'hail' | 'totalSevere' | 'day4-8',
  props: Partial<React.ComponentProps<typeof Legend>> = {},
  darkMode = false,
) => {
  const store = createMockStore({
    forecast: { drawingState: { activeOutlookType }, uiVariant: 'standard' },
    theme: { darkMode },
  });
  return render(<Provider store={store}><Legend activeOutlookType={activeOutlookType} {...props} /></Provider>);
};

describe('Legend', () => {
  it('renders ordered custom labels and exact hatch appearance in local custom mode', () => {
    const store = createMockStore();
    store.dispatch(addCustomLayer({
      schemaVersion: CUSTOM_PRODUCTS_SCHEMA_VERSION,
      id: asCustomLayerId('winter'), label: 'Winter impacts', order: 0,
      categories: [
        { id: 'major' as never, label: 'Major', order: 1, style: { fillColor: '#ef4444', fillOpacity: .7, strokeColor: '#111827', strokeOpacity: 1, strokeWidth: 2, hatch: 'crosshatch' } },
        { id: 'minor' as never, label: 'Minor', order: 0, style: { fillColor: '#22c55e', fillOpacity: .5, strokeColor: '#111827', strokeOpacity: 1, strokeWidth: 2, hatch: 'none' } },
      ], features: [], createdAt: '2026-07-17T12:00:00.000Z', updatedAt: '2026-07-17T12:00:00.000Z',
    }));
    store.dispatch(setCustomEditorMode('custom'));
    render(<Provider store={store}><Legend /></Provider>);
    expect(screen.getByText('Winter impacts')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Minor', 'Major']);
    expect(screen.getByRole('img', { name: 'Major custom style' })).toHaveStyle({ backgroundColor: '#ef4444', opacity: '1' });
  });

  it('renders the legend component without crashing', () => {
    renderSevereLegend('categorical');
    // Legend should render its title
    expect(screen.getByText(/categorical risk levels/i)).toBeInTheDocument();
  });

  it('renders tornado outlook type', () => {
    renderSevereLegend('tornado');
    expect(screen.getByText(/tornado/i)).toBeInTheDocument();
  });

  it('marks the legend as open for the mobile popout state', () => {
    renderSevereLegend('tornado', { mobileOpen: true });

    expect(screen.getByRole('complementary', { name: /map legend/i })).toHaveClass('map-legend--mobile-open');
  });

  it('marks the legend as hidden when the desktop key is toggled off', () => {
    renderSevereLegend('tornado', { desktopOpen: false });

    expect(screen.getByRole('complementary', { name: /map legend/i })).toHaveClass('map-legend--desktop-hidden');
  });

  it.each([
    ['wind', /wind probabilities/i, /90%/i, /CIG3 \(Hatching\)/i],
    ['hail', /hail probabilities/i, /60%/i, /CIG2 \(Hatching\)/i],
    ['totalSevere', /totalsevere probabilities/i, /45%/i, /CIG1 \(Hatching\)/i],
    ['day4-8', /day4-8 probabilities/i, /15%/i, /30%/i],
  ] as const)('renders %s probability entries', (activeOutlookType, title, firstEntry, secondEntry) => {
    renderSevereLegend(activeOutlookType);

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(firstEntry)).toBeInTheDocument();
    expect(screen.getByText(secondEntry)).toBeInTheDocument();
  });

  it('uses dark-mode styling for hatch swatches', () => {
    renderSevereLegend('tornado', {}, true);

    expect(screen.getByRole('img', { name: /Legend for CIG1/i })).toHaveStyle({
      border: '1px solid rgba(255,255,255,0.55)',
    });
  });
});
