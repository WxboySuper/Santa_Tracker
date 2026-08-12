import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import type { Feature, Polygon } from 'geojson';
import ForecastWorkflowPanel from './ForecastWorkflowPanel';
import type { ForecastWorkspaceController } from '../ForecastWorkspace/useForecastWorkspaceController';
import forecastReducer, {
  addFeature,
  startBlankCycle,
  updateDiscussion,
} from '../../store/forecastSlice';

jest.mock('lucide-react', () => new Proxy({}, {
  get: () => (props: React.SVGProps<SVGSVGElement>) => <svg {...props} />,
}));

const createPolygon = (offset: number): Polygon => ({
  type: 'Polygon',
  coordinates: [[
    [offset, offset],
    [offset + 1, offset],
    [offset + 1, offset + 1],
    [offset, offset + 1],
    [offset, offset],
  ]],
});

const createFeature = (id: string, offset: number, outlookType: string, probability: string): Feature => ({
  type: 'Feature',
  id,
  geometry: createPolygon(offset),
  properties: { outlookType, probability },
});

const createCompleteWorkflowStore = () => {
  const store = configureStore({
    reducer: { forecast: forecastReducer },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({ serializableCheck: false }),
  });
  store.dispatch(startBlankCycle({
    workflowTemplate: { id: 'severe-day1', label: 'Severe Convective Day 1', groupings: ['day1'] },
    cycleDate: '2026-08-12',
  }));
  store.dispatch(addFeature({ feature: createFeature('tornado-1', 0, 'tornado', '2%') }));
  store.dispatch(addFeature({ feature: createFeature('wind-1', 2, 'wind', '5%') }));
  store.dispatch(addFeature({ feature: createFeature('hail-1', 4, 'hail', '5%') }));
  store.dispatch(addFeature({ feature: createFeature('categorical-1', 6, 'categorical', 'SLGT') }));
  store.dispatch(updateDiscussion({
    day: 1,
    scopeId: 'day1',
    discussion: {
      mode: 'diy',
      validStart: '2026-08-12T12:00',
      validEnd: '2026-08-13T12:00',
      forecasterName: 'Test',
      diyContent: 'Severe storms are possible.',
      lastModified: '2026-08-12T12:00:00.000Z',
    },
  }));
  return store;
};

const renderPanel = (context: 'forecast' | 'discussion', controller?: ForecastWorkspaceController) => {
  const store = createCompleteWorkflowStore();
  render(
    <MemoryRouter>
      <Provider store={store}>
        <ForecastWorkflowPanel context={context} controller={controller} />
      </Provider>
    </MemoryRouter>,
  );
};

describe('ForecastWorkflowPanel completion review', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows Review Package on the Forecast page once the package is complete', () => {
    const onOpenCompletionModal = jest.fn();
    const controller = { onOpenCompletionModal } as unknown as ForecastWorkspaceController;

    renderPanel('forecast', controller);

    fireEvent.click(screen.getByRole('button', { name: 'Review Package' }));
    expect(onOpenCompletionModal).toHaveBeenCalledTimes(1);
  });

  it('closes the Discussion-page review modal when Cancel is clicked', async () => {
    renderPanel('discussion');

    fireEvent.click(screen.getByRole('button', { name: 'Review Package' }));
    expect(await screen.findByText('Ready for export')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByText('Ready for export')).not.toBeInTheDocument());
  });
});
