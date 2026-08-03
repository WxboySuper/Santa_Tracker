import mockReact from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { BrowserRouter } from 'react-router-dom';
import appModeReducer from '../../store/appModeSlice';
import forecastReducer from '../../store/forecastSlice';
import themeReducer from '../../store/themeSlice';
import AppLayout from './AppLayout';

const createMockStore = () =>
  configureStore({
    reducer: {
      appMode: appModeReducer,
      forecast: forecastReducer,
      theme: themeReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false, immutableCheck: false }),
  });

const renderWithRouter = (ui: mockReact.ReactElement) => {
  return render(
    <BrowserRouter>
      <Provider store={createMockStore()}>
        {ui}
      </Provider>
    </BrowserRouter>
  );
};

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  Outlet: () => mockReact.createElement('div', { 'data-testid': 'test-content' }),
  useNavigate: () => jest.fn(),
  Link: ({ children }: { children: mockReact.ReactNode }) => mockReact.createElement('a', null, children),
}));

jest.mock('../AlertBanner', () => ({
  AlertBanner: () => mockReact.createElement('div', { 'data-testid': 'alert-banner' }),
}));

jest.mock('./Navbar', () => ({
  Navbar: ({
    onToggleDocumentation,
    onViewTerms,
    onViewPrivacyPolicy,
  }: {
    onToggleDocumentation: () => void;
    onViewTerms: () => void;
    onViewPrivacyPolicy: () => void;
  }) =>
    mockReact.createElement('nav', { 'data-testid': 'navbar' }, [
      mockReact.createElement('button', { key: 'docs', onClick: onToggleDocumentation }, 'Docs'),
      mockReact.createElement('button', { key: 'terms', onClick: onViewTerms }, 'Terms'),
      mockReact.createElement('button', { key: 'privacy', onClick: onViewPrivacyPolicy }, 'Privacy'),
    ]),
}));

jest.mock('../Documentation/Documentation', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) =>
    mockReact.createElement('div', { 'data-testid': 'docs' }, [
      mockReact.createElement('span', { key: 'label' }, 'Docs panel'),
      mockReact.createElement('button', { key: 'close', onClick: onClose }, 'Close Docs'),
    ]),
}));

jest.mock('../Toast/Toast', () => ({
  ToastManager: ({ toasts, onDismiss }: { toasts: Array<{ id: string; message: string }>; onDismiss: (id: string) => void }) =>
    mockReact.createElement('div', { 'data-testid': 'toast' }, toasts.map((toast) =>
      mockReact.createElement('button', { key: toast.id, onClick: () => onDismiss(toast.id) }, toast.message)
    )),
}));

jest.mock('../ToS/ToSModal', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) =>
    mockReact.createElement('div', { 'data-testid': 'tos' }, mockReact.createElement('button', { onClick: onClose }, 'Close Terms')),
}));

jest.mock('../PrivacyPolicy/PrivacyPolicyModal', () => ({
  __esModule: true,
  default: ({ onClose }: { onClose: () => void }) =>
    mockReact.createElement('div', { 'data-testid': 'privacy' }, mockReact.createElement('button', { onClick: onClose }, 'Close Privacy')),
}));

describe('AppLayout', () => {
  it('renders routed content within the app layout', () => {
    renderWithRouter(<AppLayout />);
    
    expect(screen.getByTestId('test-content')).toBeInTheDocument();
  });

  it('renders the navbar', () => {
    renderWithRouter(<AppLayout />);
    expect(screen.getByTestId('navbar')).toBeInTheDocument();
  });

  it('opens and closes documentation, terms, and privacy viewers', () => {
    renderWithRouter(<AppLayout />);

    fireEvent.click(screen.getByText('Docs'));
    expect(screen.getByTestId('docs')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('docs')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Docs'));
    fireEvent.click(screen.getByText('Close Docs'));
    expect(screen.queryByTestId('docs')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Terms'));
    expect(screen.getByTestId('tos')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close Terms'));
    expect(screen.queryByTestId('tos')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Privacy'));
    expect(screen.getByTestId('privacy')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close Privacy'));
    expect(screen.queryByTestId('privacy')).not.toBeInTheDocument();
  });

  it('does not throw when Ctrl/Cmd keydown omits KeyboardEvent.key', () => {
    renderWithRouter(<AppLayout />);

    const event = new KeyboardEvent('keydown', { bubbles: true, ctrlKey: true });
    Object.defineProperty(event, 'key', { value: undefined });

    expect(() => window.dispatchEvent(event)).not.toThrow();
  });
});
