import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import BetaAuthCard from './BetaAuthCard';
import { useAuth } from '../../auth/AuthProvider';

// Mock useAuth
jest.mock('../../auth/AuthProvider', () => ({
  useAuth: jest.fn(),
}));

// Mock lucide-react
jest.mock('lucide-react', () => ({
  Cloud: () => <div data-testid="cloud-icon" />,
  LoaderCircle: () => <div data-testid="loader-icon" />,
  Mail: () => <div data-testid="mail-icon" />,
}));

describe('BetaAuthCard', () => {
  const signInWithEmail = jest.fn();
  const signInWithGoogle = jest.fn();
  const signUpWithEmail = jest.fn();

  const fillEmailPassword = (email: string, password: string) => {
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      status: 'signed_out',
      error: null,
      signInWithEmail,
      signInWithGoogle,
      signUpWithEmail,
    });
  });

  test('renders basic sign-in form', () => {
    render(<BetaAuthCard title="Beta Title" description="Beta Desc" />);
    expect(screen.getByText('Beta Title')).toBeInTheDocument();
    expect(screen.getByText('Beta Desc')).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Confirm Password/i)).not.toBeInTheDocument();
  });

  test('handles google sign-in success', async () => {
    render(<BetaAuthCard title="T" description="D" />);
    const googleButton = screen.getByText('Continue with Google');

    fireEvent.click(googleButton);

    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalled());
  });

  test('handles google sign-in failure', async () => {
    signInWithGoogle.mockRejectedValue(new Error('Google failed'));
    render(<BetaAuthCard title="T" description="D" />);
    const googleButton = screen.getByText('Continue with Google');

    fireEvent.click(googleButton);

    expect(await screen.findByText('Google failed')).toBeInTheDocument();
  });

  test('handles email sign-in success', async () => {
    render(<BetaAuthCard title="T" description="D" />);
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });

    fireEvent.click(screen.getByRole('button', { name: /Sign In with Email/i }));

    await waitFor(() => expect(signInWithEmail).toHaveBeenCalledWith('test@example.com', 'password123'));
  });

  it.each([
    ['handles email sign-up with password mismatch', 'mismatch', 'Passwords do not match.', false],
    ['handles email sign-up success', 'password123', null, true],
  ])('%s', async (_name, confirmPassword, expectedError) => {
    render(<BetaAuthCard title="T" description="D" allowSignUp />);
    fireEvent.click(screen.getByText('Create Account'));
    fillEmailPassword('new@example.com', 'password123');
    fireEvent.change(screen.getByLabelText(/Confirm Password/i), { target: { value: confirmPassword } });
    fireEvent.click(screen.getByRole('button', { name: /Create Beta Account/i }));

    if (expectedError) {
      expect(await screen.findByText(expectedError)).toBeInTheDocument();
      expect(signUpWithEmail).not.toHaveBeenCalled();
      return;
    }

    await waitFor(() => expect(signUpWithEmail).toHaveBeenCalledWith('new@example.com', 'password123'));
  });

  test('handles email sign-in general failure', async () => {
    signInWithEmail.mockRejectedValue('Generic error');
    render(<BetaAuthCard title="T" description="D" />);
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
    
    fireEvent.click(screen.getByRole('button', { name: /Sign In with Email/i }));

    expect(await screen.findByText('Unable to complete that request right now.')).toBeInTheDocument();
  });

  test('shows loading state when busy', () => {
    (useAuth as jest.Mock).mockReturnValue({
      status: 'loading',
      signInWithEmail, signInWithGoogle, signUpWithEmail
    });
    render(<BetaAuthCard title="T" description="D" />);
    expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
  });
});
