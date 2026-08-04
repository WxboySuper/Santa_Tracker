import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import { PricingPage } from './PricingPage';

jest.mock('../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));
jest.mock('../billing/EntitlementProvider', () => ({
  useEntitlement: jest.fn(),
}));

const mockUseAuth = jest.requireMock('../auth/AuthProvider').useAuth as jest.Mock;
const mockUseEntitlement = jest.requireMock('../billing/EntitlementProvider').useEntitlement as jest.Mock;

describe('PricingPage', () => {
  beforeEach(() => {
    mockUseEntitlement.mockReturnValue({
      entitlementStatus: 'free',
      premiumActive: false,
      planInterval: null,
      billingStatus: 'inactive',
      effectiveSource: 'none',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      stripeCustomerId: null,
      betaOverrideActive: false,
      checkoutEnabled: true,
      billingEnabled: true,
      annualPromoActive: false,
      monthlyDisplayPrice: '$3/month',
      annualDisplayPrice: '$30/year',
      error: null,
      openCheckout: jest.fn(),
      openBillingPortal: jest.fn(),
    });
  });

  test('shows sign-in CTA when the user is signed out', () => {
    mockUseAuth.mockReturnValue({
      status: 'signed_out',
    });

    render(
      <BrowserRouter>
        <PricingPage />
      </BrowserRouter>
    );

    expect(screen.getByRole('link', { name: /Sign in to choose premium/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Compare plans/i })).toBeInTheDocument();
    expect(screen.getByText(/Everything needed to build, write, save, export, and verify forecasts locally/i)).toBeInTheDocument();
  });

  test('shows checkout actions for signed-in users', () => {
    mockUseAuth.mockReturnValue({
      status: 'signed_in',
    });

    render(
      <BrowserRouter>
        <PricingPage />
      </BrowserRouter>
    );

    expect(screen.getByRole('button', { name: /Choose monthly/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Choose annual/i })).toBeInTheDocument();
  });

  test('shows the active premium tier when the user already has a subscription', () => {
    mockUseAuth.mockReturnValue({
      status: 'signed_in',
    });
    mockUseEntitlement.mockReturnValue({
      entitlementStatus: 'premium',
      premiumActive: true,
      planInterval: 'monthly',
      billingStatus: 'active',
      effectiveSource: 'stripe',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      stripeCustomerId: 'cus_test',
      betaOverrideActive: false,
      checkoutEnabled: true,
      billingEnabled: true,
      annualPromoActive: false,
      monthlyDisplayPrice: '$3/month',
      annualDisplayPrice: '$30/year',
      error: null,
      openCheckout: jest.fn(),
      openBillingPortal: jest.fn(),
    });

    render(
      <BrowserRouter>
        <PricingPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/Current: Monthly/i)).toBeInTheDocument();
    expect(screen.getAllByText(/You are currently on Premium Monthly/i)).toHaveLength(2);
    expect(screen.getByRole('link', { name: /View Billing Details/i })).toBeInTheDocument();
  });
});
