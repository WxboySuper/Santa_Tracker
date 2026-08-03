import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import ToolbarPanel from './ToolbarPanel';
import forecastReducer from '../../store/forecastSlice';

jest.mock('lucide-react', () => ({
  Save: () => <div data-testid="icon-save" />,
  FolderOpen: () => <div data-testid="icon-folder" />,
  Download: () => <div data-testid="icon-download" />,
  Upload: () => <div data-testid="icon-upload" />,
  History: () => <div data-testid="icon-history" />,
  Copy: () => <div data-testid="icon-copy" />,
  Plus: () => <div data-testid="icon-plus" />,
  BarChart3: () => <div data-testid="icon-chart" />,
  X: () => <div data-testid="icon-x" />,
  Menu: () => <div data-testid="icon-menu" />,
  Image: () => <div data-testid="icon-image" />,
  Trash2: () => <div data-testid="icon-trash" />,
}));

jest.mock('../DrawingTools/ConfirmationModal', () => () => <div data-testid="confirmation-modal" />);
jest.mock('../DrawingTools/ExportModal', () => () => <div data-testid="export-modal" />);
jest.mock('../CycleManager/CycleHistoryModal', () => () => <div data-testid="history-modal" />);
jest.mock('../CycleManager/CopyFromPreviousModal', () => () => <div data-testid="copy-modal" />);
jest.mock('../Layout', () => ({
  FloatingPanel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useAppLayout: () => ({ addToast: () => undefined }),
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Navbar: () => <div data-testid="navbar" />,
  AddToastFn: Object,
}));

const buildStore = () => configureStore({
  reducer: {
    forecast: forecastReducer,
  },
  middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
});

describe('ToolbarPanel', () => {
  it('renders the toolbar', () => {
    const store = buildStore();
    render(
      <Provider store={store}>
        <ToolbarPanel />
      </Provider>
    );
    expect(screen.getByTestId('icon-save')).toBeInTheDocument();
  });
});
