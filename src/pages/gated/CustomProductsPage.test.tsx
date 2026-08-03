import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { CustomCategoryId, HostedCustomProduct } from '../../types/customProducts';
import CustomProductsPage from './CustomProductsPage';

const mockUseAuth = jest.fn();
const mockUseCustomProducts = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('../../hooks/useCustomProducts', () => ({ useCustomProducts: () => mockUseCustomProducts() }));
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const product: HostedCustomProduct = {
  schemaVersion: '1.0.0',
  id: 'product-01' as HostedCustomProduct['id'],
  userId: 'user-1',
  label: 'Winter hazards',
  version: 1,
  status: 'active',
  categories: [{
    id: 'moderate' as CustomCategoryId,
    label: 'Moderate',
    order: 0,
    style: { fillColor: '#ff0000', fillOpacity: 0.5, strokeColor: '#990000', strokeOpacity: 1, strokeWidth: 2, hatch: 'diagonal' },
  }],
  createdAt: '2026-07-17T12:00:00.000Z',
  updatedAt: '2026-07-17T12:00:00.000Z',
};

const result = (overrides = {}) => ({
  products: [],
  loading: false,
  error: null,
  premiumActive: true,
  pendingAction: null,
  createProduct: jest.fn().mockResolvedValue(true),
  updateProduct: jest.fn().mockResolvedValue(true),
  duplicateProduct: jest.fn().mockResolvedValue(true),
  setProductStatus: jest.fn().mockResolvedValue(true),
  deleteProduct: jest.fn().mockResolvedValue(true),
  useProduct: jest.fn(),
  ...overrides,
});

describe('CustomProductsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { uid: 'user-1' } });
    mockUseCustomProducts.mockReturnValue(result());
  });

  test('creates an ordered product draft with live preview controls', async () => {
    const user = userEvent.setup();
    const customProducts = result();
    mockUseCustomProducts.mockReturnValue(customProducts);
    render(<MemoryRouter><CustomProductsPage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /New product/i }));
    await user.type(screen.getByLabelText('Product name'), 'Fire weather');
    await user.clear(screen.getByLabelText('Category 1 label'));
    await user.type(screen.getByLabelText('Category 1 label'), 'Elevated');
    fireEvent.change(screen.getByLabelText('Category 1 stroke color'), { target: { value: '#123456' } });
    fireEvent.change(screen.getByLabelText('Category 1 stroke opacity'), { target: { value: '0.4' } });
    fireEvent.change(screen.getByLabelText('Category 1 stroke width'), { target: { value: '4' } });
    await user.selectOptions(screen.getByLabelText('Category 1 hatch'), 'crosshatch');
    const swatch = screen.getByLabelText('Product preview').querySelector<HTMLElement>('.custom-product-preview__swatch');
    expect(swatch).toHaveStyle({ borderColor: 'rgba(18, 52, 86, 0.4)', borderWidth: '4px' });
    expect(swatch?.style.backgroundImage).toContain('rgba(18, 52, 86, 0.4)');
    await user.click(screen.getByRole('button', { name: /Add category/i }));
    await user.click(screen.getByRole('button', { name: /Move Category 2 up/i }));
    await user.click(screen.getByRole('button', { name: /Create product/i }));

    expect(customProducts.createProduct).toHaveBeenCalledWith(expect.objectContaining({
      label: 'Fire weather',
      categories: expect.arrayContaining([expect.objectContaining({ label: 'Elevated' })]),
    }));
  });

  test('duplicates, archives, deletes, and stages a product for the forecast', async () => {
    const user = userEvent.setup();
    const customProducts = result({ products: [product], useProduct: jest.fn().mockReturnValue({ id: 'layer-1' }) });
    mockUseCustomProducts.mockReturnValue(customProducts);
    render(<MemoryRouter><CustomProductsPage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /Duplicate/i }));
    await user.click(screen.getByRole('button', { name: /Archive/i }));
    await user.click(screen.getByRole('button', { name: /^Delete$/i }));
    await user.click(screen.getByRole('button', { name: /^Delete$/i }));
    await user.click(screen.getByRole('button', { name: /Use in Forecast/i }));

    expect(customProducts.duplicateProduct).toHaveBeenCalledWith(product);
    expect(customProducts.setProductStatus).toHaveBeenCalledWith(product, 'archived');
    expect(customProducts.deleteProduct).toHaveBeenCalledWith(product);
    expect(customProducts.useProduct).toHaveBeenCalledWith(product);
    expect(mockNavigate).toHaveBeenCalledWith('/forecast');
  });

  test('keeps editing and new-map use unavailable without premium while retaining deletion', async () => {
    const user = userEvent.setup();
    const customProducts = result({ products: [product], premiumActive: false });
    mockUseCustomProducts.mockReturnValue(customProducts);
    render(<MemoryRouter><CustomProductsPage /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /New product/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Use in Forecast/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Edit/i })).toBeDisabled();
    expect(screen.getByText(/remain visible and can be deleted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Delete$/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /^Delete$/i }));
    await user.click(screen.getByRole('button', { name: /^Delete$/i }));
    expect(customProducts.deleteProduct).toHaveBeenCalledWith(product);
  });

  test('disables every product mutation while an action is pending', () => {
    mockUseCustomProducts.mockReturnValue(result({
      products: [product],
      pendingAction: { action: 'duplicate', productId: product.id },
    }));
    render(<MemoryRouter><CustomProductsPage /></MemoryRouter>);

    expect(screen.getByRole('button', { name: /New product/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Use in Forecast/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Edit/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Duplicate/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Archive/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^Delete$/i })).toBeDisabled();
  });

  test('keeps create and edit modes mutually exclusive', async () => {
    const user = userEvent.setup();
    mockUseCustomProducts.mockReturnValue(result({ products: [product] }));
    render(<MemoryRouter><CustomProductsPage /></MemoryRouter>);

    await user.click(screen.getByRole('button', { name: /Edit/i }));
    expect(screen.getByRole('heading', { name: /Edit Winter hazards/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New product/i })).toBeDisabled();
    expect(screen.queryByText(/Create reusable product/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    await user.click(screen.getByRole('button', { name: /New product/i }));
    expect(screen.getByRole('heading', { name: /Create reusable product/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit/i })).toBeDisabled();
    expect(screen.queryByRole('heading', { name: /Edit Winter hazards/i })).not.toBeInTheDocument();
  });
});
