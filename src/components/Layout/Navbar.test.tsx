import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router';
import Navbar from './Navbar';
import themeReducer from '../../store/themeSlice';

jest.mock('../ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ hostedAuthEnabled: false, status: 'signed_out', user: null }),
}));

jest.mock('../ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button onClick={onSelect}>{children}</button>
  ),
  DropdownMenuLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

const renderNavbar = (props = {}) => {
  const store = configureStore({ reducer: { theme: themeReducer } });
  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter>
          <Navbar {...props} />
        </MemoryRouter>
      </Provider>
    ),
  };
};

describe('Navbar', () => {
  test('renders sections and dispatches dark-mode toggle', () => {
    const onToggleDocumentation = jest.fn();
    const { store } = renderNavbar({ onToggleDocumentation });

    expect(screen.getByText('Graphical Forecast Creator')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Switch to dark mode/i));
    expect(store.getState().theme.darkMode).toBe(true);
    fireEvent.click(screen.getByText('Documentation'));
    expect(onToggleDocumentation).toHaveBeenCalledTimes(1);
  });
});
