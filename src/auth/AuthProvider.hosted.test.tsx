import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { AuthProvider, useAuth } from './AuthProvider';
import themeReducer from '../store/themeSlice';
import overlaysReducer from '../store/overlaysSlice';

// Mock firebase auth completely - starts as signed_out when no user
jest.mock('../lib/firebase', () => ({
  auth: {
    onAuthStateChanged: jest.fn((cb) => {
      cb(null);
      return jest.fn();
    }),
  },
  db: {},
  googleAuthProvider: {},
  isHostedAuthEnabled: true,
  requireAuth: jest.fn(),
  requireDb: jest.fn(),
}));

// Mock productMetrics
jest.mock('../utils/productMetrics', () => ({
  queueProductMetric: jest.fn(),
}));

const createMockStore = () => configureStore({
  reducer: {
    theme: themeReducer,
    overlays: overlaysReducer,
  },
});

describe('AuthProvider Hosted Auth', () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    store = createMockStore();
    jest.clearAllMocks();
  });

  test('renders signed_out when no authenticated user', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <Provider store={store}>
          <AuthProvider>{children}</AuthProvider>
        </Provider>
      ),
    });

    expect(result.current.status).toBe('signed_out');
  });
});