import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import forecastReducer from "../store/forecastSlice";
import { AccountPage } from "./AccountPage";

jest.mock("../auth/AuthProvider", () => ({
  useAuth: jest.fn(),
}));
jest.mock("../billing/EntitlementProvider", () => ({
  useEntitlement: jest.fn(),
}));
jest.mock("../metrics/useUserMetrics", () => ({
  useUserMetrics: jest.fn(),
}));

const mockUseAuth = jest.requireMock("../auth/AuthProvider")
  .useAuth as jest.Mock;
const mockUseEntitlement = jest.requireMock("../billing/EntitlementProvider")
  .useEntitlement as jest.Mock;
const mockUseUserMetrics = jest.requireMock("../metrics/useUserMetrics")
  .useUserMetrics as jest.Mock;
let store: ReturnType<typeof configureStore>;

describe("AccountPage", () => {
  beforeEach(() => {
    localStorage.clear();
    mockUseEntitlement.mockReturnValue({
      entitlementStatus: "free",
      premiumActive: false,
      planInterval: null,
      billingStatus: "inactive",
      effectiveSource: "none",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      stripeCustomerId: null,
      betaOverrideActive: false,
      checkoutEnabled: false,
      billingEnabled: false,
      annualPromoActive: false,
      monthlyDisplayPrice: "$3/month",
      annualDisplayPrice: "$30/year",
      error: null,
      openCheckout: jest.fn(),
      openBillingPortal: jest.fn(),
    });
    mockUseUserMetrics.mockReturnValue({
      metrics: {
        uid: "user-1",
        activeDayStreak: 4,
        totalActiveDays: 10,
        cyclesCreated: 3,
        cloudCyclesSaved: 2,
        discussionsWritten: 1,
        verificationSessionsRun: 5,
        lastActiveDate: "2026-03-30",
        updatedAt: null,
      },
      loading: false,
      error: null,
    });

    // Create a minimal Redux store used to provide react-redux context for the AccountPage and its children.
    store = configureStore({
      reducer: { forecast: forecastReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false,
          immutableCheck: false,
        }),
    });
  });

  test.each([
    {
      name: "shows the local-only fallback when hosted auth is disabled",
      authState: {
        hostedAuthEnabled: false,
        status: "disabled",
        settingsSyncStatus: "disabled",
        user: null,
        syncedSettings: null,
        error: null,
        signInWithGoogle: jest.fn(),
        signInWithEmail: jest.fn(),
        signUpWithEmail: jest.fn(),
        signOutUser: jest.fn(),
        updateSyncedSettings: jest.fn(),
      },
      assertion: () => {
        expect(
          screen.getByRole("heading", { name: /^Account$/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByRole("heading", { name: /Local-only mode/i }),
        ).toBeInTheDocument();
        expect(
          screen.getByText(/running in local-only mode/i),
        ).toBeInTheDocument();
      },
    },
    {
      name: "shows confirm password only in create-account mode",
      authState: {
        hostedAuthEnabled: true,
        status: "signed_out",
        settingsSyncStatus: "idle",
        user: null,
        syncedSettings: null,
        error: null,
        signInWithGoogle: jest.fn(),
        signInWithEmail: jest.fn(),
        signUpWithEmail: jest.fn(),
        signOutUser: jest.fn(),
        updateSyncedSettings: jest.fn(),
      },
      assertion: () => {
        expect(
          screen.queryByLabelText(/Confirm Password/i),
        ).not.toBeInTheDocument();
        fireEvent.click(
          screen.getByRole("button", { name: /Create Account/i }),
        );
        expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();
      },
    },
  ])("$name", ({ authState, assertion }) => {
    mockUseAuth.mockReturnValue(authState);

    render(
      <BrowserRouter>
        <Provider store={store}>
          <AccountPage />
        </Provider>
      </BrowserRouter>,
    );

    assertion();
  });

  test("shows a simplified signed-in account view with one sync status badge", () => {
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: "signed_in",
      settingsSyncStatus: "synced",
      betaAccess: false,
      user: {
        email: "alex@example.com",
        displayName: "Alex",
        providerData: [{ providerId: "google.com" }],
      },
      syncedSettings: {
        defaultForecasterName: "Alex",
      },
      error: null,
      signInWithGoogle: jest.fn(),
      signInWithEmail: jest.fn(),
      signUpWithEmail: jest.fn(),
      signOutUser: jest.fn(),
      updateSyncedSettings: jest.fn(),
    });

    render(
      <BrowserRouter>
        <Provider store={store}>
          <AccountPage />
        </Provider>
      </BrowserRouter>,
    );

    expect(screen.getAllByText("alex@example.com")).toHaveLength(2);
    expect(screen.getAllByText("Google")).toHaveLength(2);
    expect(screen.getByDisplayValue("Alex")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Sign Out/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^Synced$/i)).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: /View Pricing/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^4$/)).toBeInTheDocument();
    expect(screen.getByText(/^10$/)).toBeInTheDocument();
  });

  test("handles premium billing, saving defaults, and sign-out actions", async () => {
    const user = userEvent.setup();
    const signOutUser = jest.fn().mockResolvedValue();
    const updateSyncedSettings = jest.fn().mockResolvedValue();
    const openBillingPortal = jest
      .fn()
      .mockRejectedValue(new Error("Portal unavailable"));

    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: "signed_in",
      settingsSyncStatus: "error",
      betaAccess: false,
      user: {
        email: "alex@example.com",
        displayName: "Alex",
        providerData: [
          { providerId: "password" },
          { providerId: "github.com" },
        ],
      },
      syncedSettings: {
        defaultForecasterName: "Alex",
        forecastUiVariant: "integrated",
      },
      error: null,
      signInWithGoogle: jest.fn(),
      signInWithEmail: jest.fn(),
      signUpWithEmail: jest.fn(),
      signOutUser,
      updateSyncedSettings,
    });

    mockUseEntitlement.mockReturnValue({
      entitlementStatus: "premium",
      premiumActive: true,
      planInterval: "annual",
      billingStatus: "active",
      effectiveSource: "beta_override",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: "2026-04-30",
      stripeCustomerId: "cus_123",
      betaOverrideActive: true,
      checkoutEnabled: false,
      billingEnabled: true,
      annualPromoActive: false,
      monthlyDisplayPrice: "$3/month",
      annualDisplayPrice: "$30/year",
      error: null,
      openCheckout: jest.fn(),
      openBillingPortal,
    });

    mockUseUserMetrics.mockReturnValue({
      metrics: {
        uid: "user-1",
        activeDayStreak: 0,
        totalActiveDays: 0,
        cyclesCreated: 0,
        cloudCyclesSaved: 0,
        discussionsWritten: 0,
        verificationSessionsRun: 0,
        lastActiveDate: null,
        updatedAt: null,
      },
      loading: false,
      error: null,
    });

    render(
      <BrowserRouter>
        <Provider store={store}>
          <AccountPage />
        </Provider>
      </BrowserRouter>,
    );

    expect(screen.getByText(/Needs Attention/i)).toBeInTheDocument();
    expect(screen.getByText(/Premium Annual/i)).toBeInTheDocument();
    expect(screen.getByText(/\$30\/year/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Premium is currently being granted through the beta override path/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/No activity yet/i)).toBeInTheDocument();
    expect(screen.getByText("github.com")).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Default forecaster name/i));
    await user.type(
      screen.getByLabelText(/Default forecaster name/i),
      "Taylor",
    );
    await user.click(screen.getByRole("button", { name: /Save Changes/i }));
    expect(updateSyncedSettings).toHaveBeenCalledWith({
      defaultForecasterName: "Taylor",
    });
    expect(
      await screen.findByText(/Saved to your account/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Manage Subscription/i }),
    );
    expect(await screen.findByText(/Portal unavailable/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Sign Out/i }));
    expect(signOutUser).toHaveBeenCalled();
  });

  test("shows monthly premium pricing and annual promo copy for standard billing", () => {
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: "signed_in",
      settingsSyncStatus: "synced",
      betaAccess: false,
      user: {
        email: "alex@example.com",
        displayName: "Alex",
        providerData: [{ providerId: "google.com" }],
      },
      syncedSettings: {
        defaultForecasterName: "Alex",
      },
      error: null,
      signInWithGoogle: jest.fn(),
      signInWithEmail: jest.fn(),
      signUpWithEmail: jest.fn(),
      signOutUser: jest.fn(),
      updateSyncedSettings: jest.fn(),
    });

    mockUseEntitlement.mockReturnValue({
      entitlementStatus: "premium",
      premiumActive: true,
      planInterval: "monthly",
      billingStatus: "active",
      effectiveSource: "stripe",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: "2026-04-30",
      stripeCustomerId: null,
      betaOverrideActive: false,
      checkoutEnabled: false,
      billingEnabled: false,
      annualPromoActive: true,
      monthlyDisplayPrice: "$3/month",
      annualDisplayPrice: "$30/year",
      error: null,
      openCheckout: jest.fn(),
      openBillingPortal: jest.fn(),
    });

    mockUseUserMetrics.mockReturnValue({
      metrics: {
        uid: "user-1",
        activeDayStreak: 4,
        totalActiveDays: 10,
        cyclesCreated: 3,
        cloudCyclesSaved: 2,
        discussionsWritten: 1,
        verificationSessionsRun: 5,
        lastActiveDate: "2026-03-30",
        updatedAt: null,
      },
      loading: false,
      error: null,
    });

    render(
      <BrowserRouter>
        <Provider store={store}>
          <AccountPage />
        </Provider>
      </BrowserRouter>,
    );

    expect(screen.getByText(/Premium Monthly/i)).toBeInTheDocument();
    expect(screen.getByText(/\$3\/month/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Annual intro pricing is currently active on this deployment/i,
      ),
    ).toBeInTheDocument();
  });

  test("shows loading metrics and an account metrics error when data is pending", () => {
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: "signed_in",
      settingsSyncStatus: "loading",
      betaAccess: false,
      user: {
        email: "alex@example.com",
        displayName: "Alex",
        providerData: [{ providerId: "google.com" }],
      },
      syncedSettings: {
        defaultForecasterName: "Alex",
      },
      error: null,
      signInWithGoogle: jest.fn(),
      signInWithEmail: jest.fn(),
      signUpWithEmail: jest.fn(),
      signOutUser: jest.fn(),
      updateSyncedSettings: jest.fn(),
    });

    mockUseUserMetrics.mockReturnValue({
      metrics: {
        uid: "user-1",
        activeDayStreak: 0,
        totalActiveDays: 0,
        cyclesCreated: 0,
        cloudCyclesSaved: 0,
        discussionsWritten: 0,
        verificationSessionsRun: 0,
        lastActiveDate: null,
        updatedAt: null,
      },
      loading: true,
      error: "Metrics sync pending",
    });

    render(
      <BrowserRouter>
        <Provider store={store}>
          <AccountPage />
        </Provider>
      </BrowserRouter>,
    );

    expect(screen.getAllByText("Loading...").length).toBeGreaterThan(0);
    expect(screen.getByText(/Metrics sync pending/i)).toBeInTheDocument();
  });

  test("shows password mismatch errors in sign-up mode", async () => {
    const user = userEvent.setup();

    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: "signed_out",
      settingsSyncStatus: "idle",
      user: null,
      syncedSettings: null,
      error: null,
      signInWithGoogle: jest.fn(),
      signInWithEmail: jest.fn(),
      signUpWithEmail: jest.fn(),
      signOutUser: jest.fn(),
      updateSyncedSettings: jest.fn(),
    });

    render(
      <BrowserRouter>
        <Provider store={store}>
          <AccountPage />
        </Provider>
      </BrowserRouter>,
    );

    await user.click(screen.getByRole("button", { name: /Create Account/i }));
    await user.type(screen.getByLabelText(/Email/i), "alex@example.com");
    await user.type(screen.getByLabelText(/^Password$/i), "secret123");
    await user.type(screen.getByLabelText(/Confirm Password/i), "different123");
    await user.click(
      screen.getAllByRole("button", { name: /Create Account/i })[1],
    );

    expect(screen.getByText(/Passwords do not match/i)).toBeInTheDocument();
  });

  test("shows sign-in errors for email and Google sign-in", async () => {
    const user = userEvent.setup();
    const signInWithEmail = jest.fn().mockRejectedValue(new Error("Bad login"));
    const signInWithGoogle = jest
      .fn()
      .mockRejectedValue(new Error("Google unavailable"));

    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: "signed_out",
      settingsSyncStatus: "idle",
      user: null,
      syncedSettings: null,
      error: null,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail: jest.fn(),
      signOutUser: jest.fn(),
      updateSyncedSettings: jest.fn(),
    });

    render(
      <BrowserRouter>
        <Provider store={store}>
          <AccountPage />
        </Provider>
      </BrowserRouter>,
    );

    await user.type(screen.getByLabelText(/Email/i), "alex@example.com");
    await user.type(screen.getByLabelText(/^Password$/i), "secret123");
    await user.click(
      screen.getByRole("button", { name: /Sign In with Email/i }),
    );
    expect(await screen.findByText(/Bad login/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Continue with Google/i }),
    );
    expect(await screen.findByText(/Google unavailable/i)).toBeInTheDocument();
  });

  test("requires password reauthentication and exact confirmation before account deletion", async () => {
    const user = userEvent.setup();
    const deleteAccount = jest.fn().mockRejectedValue(new Error("Deletion unavailable"));
    mockUseAuth.mockReturnValue({
      hostedAuthEnabled: true,
      status: "signed_in",
      settingsSyncStatus: "synced",
      betaAccess: false,
      user: {
        email: "alex@example.com",
        displayName: "Alex",
        providerData: [{ providerId: "password" }],
      },
      syncedSettings: { defaultForecasterName: "Alex" },
      error: null,
      signInWithGoogle: jest.fn(),
      signInWithEmail: jest.fn(),
      signUpWithEmail: jest.fn(),
      signOutUser: jest.fn(),
      deleteAccount,
      updateSyncedSettings: jest.fn(),
    });

    render(
      <BrowserRouter>
        <Provider store={store}>
          <AccountPage />
        </Provider>
      </BrowserRouter>,
    );

    const deleteButton = screen.getByRole("button", { name: /Permanently delete account/i });
    expect(deleteButton).toBeDisabled();
    await user.type(screen.getByLabelText(/Current password/i), "secret123");
    await user.type(screen.getByLabelText(/Type DELETE to confirm/i), "DELETE");
    expect(deleteButton).toBeEnabled();
    await user.click(deleteButton);

    expect(deleteAccount).toHaveBeenCalledWith("secret123");
    expect(await screen.findByRole("alert")).toHaveTextContent("Deletion unavailable");
  });
});
