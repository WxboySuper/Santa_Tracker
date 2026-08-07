import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import forecastReducer from "../store/forecastSlice";
import themeReducer from "../store/themeSlice";
import CloudLibraryPage from "./CloudLibraryPage";

jest.mock("../auth/AuthProvider", () => ({
  useAuth: jest.fn(),
}));
jest.mock("../billing/EntitlementProvider", () => ({
  useEntitlement: jest.fn(),
}));
jest.mock("../hooks/useCloudCycles", () => ({
  useCloudCycles: jest.fn(),
}));

const mockUseAuth = jest.requireMock("../auth/AuthProvider").useAuth as jest.Mock;
const mockUseEntitlement = jest.requireMock("../billing/EntitlementProvider").useEntitlement as jest.Mock;
const mockUseCloudCycles = jest.requireMock("../hooks/useCloudCycles").useCloudCycles as jest.Mock;

const makeStore = () =>
  configureStore({
    reducer: { forecast: forecastReducer, theme: themeReducer },
  });

const cloudCyclesResult = (overrides: Record<string, unknown> = {}) => ({
  cycles: [],
  loading: false,
  error: null as string | null,
  loadCycle: jest.fn(),
  deleteCycle: jest.fn(),
  renameCycle: jest.fn(),
  refreshCycles: jest.fn(),
  ...overrides,
});

const renderPage = (store = makeStore()) =>
  render(
    <Provider store={store}>
      <BrowserRouter>
        <CloudLibraryPage />
      </BrowserRouter>
    </Provider>
  );

describe("CloudLibraryPage", () => {
  beforeEach(() => {
    mockUseCloudCycles.mockReturnValue(cloudCyclesResult());
    mockUseEntitlement.mockReturnValue({ premiumActive: false, effectiveSource: "local" });
  });

  it("shows the signed-out gate when no user is present", () => {
    mockUseAuth.mockReturnValue({ user: null });
    renderPage();
    expect(screen.getByText(/Sign in to use your cloud library/i)).toBeTruthy();
  });

  it("renders the signed-in library header for a free user", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    renderPage();
    expect(screen.getByText(/No cloud cycles saved yet/i)).toBeTruthy();
  });

  it("shows an expired-premium notice when entitlement lapsed from Stripe", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseEntitlement.mockReturnValue({ premiumActive: false, effectiveSource: "stripe" });
    renderPage();
    expect(screen.getAllByText(/read-only/i).length).toBeGreaterThan(0);
  });

  it("shows a feedback card when an error is present", () => {
    mockUseAuth.mockReturnValue({ user: { uid: "user-1" } });
    mockUseCloudCycles.mockReturnValue(cloudCyclesResult({ error: "Failed to load cloud cycles" }));
    renderPage();
    expect(screen.getByText(/failed to load cloud cycles/i)).toBeTruthy();
  });
});
