import type { HostedCustomProduct } from '../types/customProducts';

/** Reserved identity used only by the built-in catalog supplied by GFC. */
export const BUILT_IN_CUSTOM_PRODUCT_USER_ID = 'gfc-built-in';
export const BUILT_IN_CUSTOM_PRODUCT_ID_PREFIX = 'builtin-';

export const isBuiltInCustomProductId = (value: unknown): value is string =>
  typeof value === 'string' && value.startsWith(BUILT_IN_CUSTOM_PRODUCT_ID_PREFIX);

/** Trusts the built-in marker only when its reserved catalog identity is intact. */
export const isTrustedBuiltInCustomProduct = (
  product: Pick<HostedCustomProduct, 'id' | 'userId' | 'builtIn'>,
): boolean => product.builtIn === true
  && product.userId === BUILT_IN_CUSTOM_PRODUCT_USER_ID
  && isBuiltInCustomProductId(product.id);
