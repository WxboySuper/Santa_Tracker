import { expect, test, type Page } from '@playwright/test';
import { prepareAppState } from './testSetup';

const buildTarget = process.env.VITE_BUILD_TARGET ?? 'local';
const customProductsEnabledTarget = buildTarget === 'local' || buildTarget === 'beta';

const createProduct = async (page: Page, name: string): Promise<void> => {
  await page.getByRole('button', { name: 'New product' }).click();
  await page.getByLabel('Product name').fill(name);
  await page.getByLabel('Category 1 label').fill('Elevated');
  await page.getByRole('button', { name: 'Create product' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
};

const productCard = (page: Page, name: string) => page.locator('.custom-product-card').filter({
  has: page.getByRole('heading', { name, exact: true }),
});

test.describe('Local reusable custom products', () => {
  test.skip(buildTarget !== 'local', 'Local product management is excluded from hosted targets.');

  test.beforeEach(async ({ page }) => {
    await prepareAppState(page);
    await page.goto('/custom-products?localTestAccount=premium');
  });

  test('creates, reorders, reuses, and preserves an immutable product snapshot', async ({ page }) => {
    await page.getByRole('button', { name: 'New product' }).click();
    await page.getByLabel('Product name').fill('Fire weather');
    await page.getByLabel('Category 1 label').fill('Elevated');
    await page.getByRole('button', { name: 'Add category' }).click();
    await page.getByLabel('Category 2 label').fill('Critical');
    await page.getByLabel('Category 2 hatch').selectOption('crosshatch');
    await page.getByLabel('Category 2 stroke color').fill('#123456');
    await page.getByLabel('Category 2 stroke opacity').fill('0.4');
    await page.getByLabel('Category 2 stroke width').fill('4');
    await page.getByRole('button', { name: 'Move Critical up' }).click();
    await page.getByRole('button', { name: 'Create product' }).click();

    await expect(page.getByRole('heading', { name: 'Fire weather' })).toBeVisible();
    await page.goto('/forecast?localTestAccount=premium');
    await page.getByRole('radio', { name: 'Custom' }).click();
    await page.getByRole('button', { name: 'Saved products' }).click();
    const savedProductsDialog = page.getByRole('dialog', { name: 'Saved products' });
    await expect(savedProductsDialog.getByText('Custom library', { exact: true })).toBeVisible();
    await expect(savedProductsDialog.getByText('Apply a reusable category set to this forecast without leaving your workspace.')).toBeVisible();
    await savedProductsDialog.getByRole('button', { name: 'Use in Forecast' }).click();
    await expect(savedProductsDialog).not.toBeVisible();
    await expect(page).toHaveURL(/\/forecast(?:\?localTestAccount=premium)?$/);
    await expect(page.getByLabel('Layer title')).toHaveValue('Fire weather');
    await expect(page.getByLabel('Category label')).toHaveValue('Critical');
    await expect(page.getByLabel('Category color')).toContainText('#F97316');
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('gfc-custom-product-handoff'))).toBeNull();

    await page.getByRole('button', { name: 'Saved products' }).click();
    await expect(savedProductsDialog).toBeVisible();
    await savedProductsDialog.getByRole('button', { name: 'Edit' }).click();
    await savedProductsDialog.getByLabel('Product name').fill('Updated fire weather');
    await savedProductsDialog.getByRole('button', { name: 'Save changes' }).click();
    await expect(savedProductsDialog.getByRole('heading', { name: 'Updated fire weather' })).toBeVisible();
    await savedProductsDialog.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByLabel('Layer title')).toHaveValue('Fire weather');
    await expect(page.getByLabel('Category label')).toHaveValue('Critical');
  });

  test('duplicates, archives, restores, and permanently deletes products', async ({ page }) => {
    await createProduct(page, 'Lifecycle product');
    const original = productCard(page, 'Lifecycle product');
    await original.getByRole('button', { name: 'Duplicate' }).click();
    await expect(page.getByRole('heading', { name: 'Lifecycle product copy', exact: true })).toBeVisible();

    await original.getByRole('button', { name: 'Archive' }).click();
    await expect(original.getByText('archived', { exact: true })).toBeVisible();
    await original.getByRole('button', { name: 'Restore' }).click();
    await expect(original.getByText('active', { exact: true })).toBeVisible();

    const duplicate = productCard(page, 'Lifecycle product copy');
    await duplicate.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(duplicate.getByText('Delete permanently?')).toBeVisible();
    await duplicate.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Lifecycle product copy', exact: true })).not.toBeVisible();
  });

  test('reports validation failures and enforces the twenty-product limit', async ({ page }) => {
    await page.getByRole('button', { name: 'New product' }).click();
    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page.getByText('Enter a product name.')).toBeVisible();
    await page.getByLabel('Product name').fill('Validation product');
    await page.getByLabel('Category 1 label').fill('');
    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page.getByText('Every category needs a label.')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await page.evaluate(() => {
      const now = '2026-07-17T12:00:00.000Z';
      const products = Array.from({ length: 20 }, (_, index) => ({
        schemaVersion: '1.0.0',
        id: `seed-product-${index + 1}`,
        userId: 'local-test-premium',
        label: `Seed product ${String(index + 1).padStart(2, '0')}`,
        version: 1,
        status: 'active',
        categories: [{
          id: `seed-category-${index + 1}`,
          label: 'Category',
          order: 0,
          style: {
            fillColor: '#f97316', fillOpacity: 0.45, strokeColor: '#c2410c',
            strokeOpacity: 1, strokeWidth: 2, hatch: 'none',
          },
        }],
        createdAt: now,
        updatedAt: now,
      }));
      localStorage.setItem('gfc-local-custom-products:local-test-premium', JSON.stringify(products));
    });
    await page.reload();

    await expect(page.getByText('20/20 products · 20 active')).toBeVisible();
    await expect(page.getByRole('button', { name: 'New product' })).toBeDisabled();
  });

  test('serializes concurrent tabs and rejects a stale edit', async ({ page, context }) => {
    const secondPage = await context.newPage();
    await prepareAppState(secondPage);
    await secondPage.goto('/custom-products?localTestAccount=premium');

    await page.getByRole('button', { name: 'New product' }).click();
    await page.getByLabel('Product name').fill('Concurrent A');
    await page.getByLabel('Category 1 label').fill('Category A');
    await secondPage.getByRole('button', { name: 'New product' }).click();
    await secondPage.getByLabel('Product name').fill('Concurrent B');
    await secondPage.getByLabel('Category 1 label').fill('Category B');
    await Promise.all([
      page.getByRole('button', { name: 'Create product' }).click(),
      secondPage.getByRole('button', { name: 'Create product' }).click(),
    ]);

    for (const candidate of [page, secondPage]) {
      await expect(candidate.getByRole('heading', { name: 'Concurrent A', exact: true })).toBeVisible();
      await expect(candidate.getByRole('heading', { name: 'Concurrent B', exact: true })).toBeVisible();
    }
    await expect.poll(() => page.evaluate(() => JSON.parse(
      localStorage.getItem('gfc-local-custom-products:local-test-premium') ?? '[]',
    ).length)).toBe(2);

    await productCard(page, 'Concurrent A').getByRole('button', { name: 'Edit' }).click();
    await productCard(secondPage, 'Concurrent A').getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Product name').fill('Concurrent winner A');
    await secondPage.getByLabel('Product name').fill('Concurrent winner B');
    await Promise.all([
      page.getByRole('button', { name: 'Save changes' }).click(),
      secondPage.getByRole('button', { name: 'Save changes' }).click(),
    ]);
    await expect.poll(async () => (
      await page.getByRole('alert').count() + await secondPage.getByRole('alert').count()
    )).toBe(1);
    await expect.poll(() => page.evaluate(() => {
      const products = JSON.parse(localStorage.getItem('gfc-local-custom-products:local-test-premium') ?? '[]');
      return Math.max(...products.map((product: { version: number }) => product.version));
    })).toBe(2);
  });

  test('keeps an opened editor usable at portrait and constrained landscape phone sizes', async ({ page }) => {
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Reusable custom products' })).toBeVisible();
      await page.getByRole('button', { name: 'New product' }).click();
      await expect(page.getByRole('heading', { name: 'Create reusable product' })).toBeVisible();
      await expect(page.getByLabel('Product name')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add category' })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
      await page.getByRole('button', { name: 'Cancel' }).click();
    }
  });

  test('keeps an expired local account read-only while allowing permanent cleanup', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('gfc-local-custom-products:local-test-free', JSON.stringify([{
        schemaVersion: '1.0.0', id: 'expired-product', userId: 'local-test-free',
        label: 'Expired fire product', version: 1, status: 'active',
        categories: [{
          id: 'elevated', label: 'Elevated', order: 0,
          style: { fillColor: '#f97316', fillOpacity: 0.45, strokeColor: '#123456', strokeOpacity: 1, strokeWidth: 2, hatch: 'none' },
        }],
        createdAt: '2026-07-17T00:00:00.000Z', updatedAt: '2026-07-17T00:00:00.000Z',
      }]));
    });
    await page.goto('/custom-products?localTestAccount=free');

    await expect(page.getByRole('heading', { name: 'Expired fire product' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Use in Forecast' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Edit' })).toBeDisabled();
    await expect(page.getByText(/remain visible and can be deleted/i)).toBeVisible();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('heading', { name: 'Expired fire product' })).toHaveCount(0);
  });

  test('shows free users a respectful Premium path from the saved-products panel', async ({ page }) => {
    await prepareAppState(page);
    await page.goto('/forecast?localTestAccount=free');
    await page.getByRole('radio', { name: 'Custom' }).click();
    await page.getByRole('button', { name: 'Saved products' }).click();

    const savedProductsDialog = page.getByRole('dialog', { name: 'Saved products' });
    await expect(savedProductsDialog.getByText('Premium feature', { exact: true })).toBeVisible();
    await expect(savedProductsDialog.getByRole('heading', { name: 'Save a product, use it whenever.' })).toBeVisible();
    await expect(savedProductsDialog.getByText('Build custom layers now, then save reusable category sets with Premium.')).toBeVisible();
    await expect(savedProductsDialog.getByRole('link', { name: 'View Premium' })).toHaveAttribute('href', '/account');
    await expect(savedProductsDialog.getByRole('button', { name: 'New product' })).not.toBeVisible();
  });
});

test.describe('Hosted custom-product absence', () => {
  test.skip(customProductsEnabledTarget, 'Requires a staging or production-target dev server.');

  test('keeps the route, account card, and Draw controls absent', async ({ page }) => {
    await prepareAppState(page);
    await page.goto('/custom-products?localTestAccount=premium');
    await expect(page).not.toHaveURL(/\/custom-products/);
    await expect(page.getByRole('heading', { name: 'Reusable custom products' })).not.toBeVisible();

    await page.goto('/account?localTestAccount=premium');
    await expect(page.getByRole('heading', { name: 'Reusable custom products' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: 'Manage Custom Products' })).not.toBeVisible();

    await page.goto('/forecast?localTestAccount=premium');
    await expect(page.getByRole('button', { name: /wind/i })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: 'Drawing product' })).not.toBeVisible();
    await expect(page.getByRole('link', { name: /Products/i })).not.toBeVisible();
  });
});

test.describe('Beta custom-product exposure', () => {
  test.skip(buildTarget !== 'beta', 'Requires a beta-target dev server.');

  test('registers the library route and exposes Custom drawing controls', async ({ page }) => {
    await prepareAppState(page);
    await page.goto('/custom-products');
    await expect(page.getByRole('heading', { name: 'Sign in to manage reusable products' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open Account' })).toHaveAttribute('href', '/account');

    await page.goto('/forecast');
    await expect(page.getByRole('radio', { name: 'Custom' })).toBeVisible();
    await page.getByRole('radio', { name: 'Custom' }).click();
    await expect(page.getByRole('button', { name: 'Saved products' })).toBeVisible();
  });
});
