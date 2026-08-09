import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Layers3, Plus } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { useCustomProducts, type UseCustomProductsResult } from '../../hooks/useCustomProducts';
import { CUSTOM_PRODUCT_LIMITS, type HostedCustomProduct, type OneOffCustomLayer } from '../../types/customProducts';
import { consumeCustomProductForecastHandoff } from '../../lib/customProductHandoff';
import { isBuiltInCustomProduct } from '../../lib/builtInCustomProducts';
import CustomProductCard from './CustomProductCard';
import CustomProductEditor from './CustomProductEditor';

const newProductDisabled = (
  customProducts: UseCustomProductsResult,
  editorOpen: boolean,
  userId?: string,
): boolean => Boolean(customProducts.pendingAction)
  || !userId
  || !customProducts.premiumActive
  || editorOpen
  || (customProducts.userProducts ?? customProducts.products.filter((product) => !isBuiltInCustomProduct(product))).length >= CUSTOM_PRODUCT_LIMITS.productsPerAccount;

const WorkspaceNotices = ({ customProducts, applicationError }: { customProducts: UseCustomProductsResult; applicationError?: string | null }) => (
  <>
    {!customProducts.premiumActive ? <Card className="custom-product-notice"><CardContent>Rainfall and Tropical AOI are built-in products available to everyone. Premium is only required to create or manage your own reusable products.</CardContent></Card> : null}
    {customProducts.error ? <p role="alert" className="custom-product-error">{customProducts.error}</p> : null}
    {applicationError ? <p role="alert" className="custom-product-error">{applicationError}</p> : null}
  </>
);

const WorkspaceEditors = ({
  creating,
  editing,
  customProducts,
  stopCreating,
  stopEditing,
}: {
  creating: boolean;
  editing: HostedCustomProduct | null;
  customProducts: UseCustomProductsResult;
  stopCreating(): void;
  stopEditing(): void;
}) => (
  <>
    {creating ? <CustomProductEditor onCancel={stopCreating} onSave={customProducts.createProduct} /> : null}
    {editing ? <CustomProductEditor product={editing} onCancel={stopEditing} onSave={(draft) => customProducts.updateProduct(editing, draft)} /> : null}
  </>
);

const ProductsHero = ({
  productCount,
  builtInCount,
  activeCount,
  newDisabled,
  onNew,
}: {
  productCount: number;
  builtInCount: number;
  activeCount: number;
  newDisabled: boolean;
  onNew(): void;
}) => (
  <header className="custom-products-hero">
    <div>
      <span className="custom-product-eyebrow">Built-in library · Personal products</span>
      <h1>Reusable custom products</h1>
      <p>Use the built-in Rainfall and Tropical AOI products for free, or build a personal category template and snapshot it into future forecasts.</p>
    </div>
    <div className="custom-products-hero__actions">
      <span>{builtInCount} built-in · {productCount}/{CUSTOM_PRODUCT_LIMITS.productsPerAccount} personal · {activeCount} active</span>
      <Button onClick={onNew} disabled={newDisabled}><Plus className="mr-2 h-4 w-4" /> New product</Button>
    </div>
  </header>
);

const ProductsLibrary = ({
  customProducts,
  editorOpen,
  onEdit,
  onUse,
}: {
  customProducts: UseCustomProductsResult;
  editorOpen: boolean;
  onEdit(product: HostedCustomProduct): void;
  onUse(product: HostedCustomProduct): void;
}) => {
  if (customProducts.loading) return <div className="custom-products-empty">Loading reusable products…</div>;
  if (customProducts.products.length === 0 && editorOpen) return null;
  if (customProducts.products.length === 0) {
    return <div className="custom-products-empty"><Layers3 className="h-10 w-10" /><h2>No reusable products yet</h2><p>Create a product with up to 12 ordered categories.</p></div>;
  }
  const pending = Boolean(customProducts.pendingAction) || editorOpen;
  return (
    <section className="custom-products-grid" aria-label="Reusable custom products">
      {customProducts.products.map((product) => (
        <CustomProductCard
          key={product.id}
          product={product}
          premiumActive={customProducts.premiumActive}
          pending={pending}
          onEdit={() => onEdit(product)}
          onDuplicate={() => void customProducts.duplicateProduct(product)}
          onStatus={() => void customProducts.setProductStatus(product, product.status === 'active' ? 'archived' : 'active')}
          onDelete={() => void customProducts.deleteProduct(product)}
          onUse={() => onUse(product)}
        />
      ))}
    </section>
  );
};

interface CustomProductsWorkspaceProps {
  embedded?: boolean;
  onProductUse?(layer: OneOffCustomLayer): boolean;
}

const CustomProductsWorkspace = ({ embedded = false, onProductUse }: CustomProductsWorkspaceProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const customProducts = useCustomProducts();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<HostedCustomProduct | null>(null);
  const [applicationError, setApplicationError] = useState<string | null>(null);
  const activeCount = useMemo(
    () => customProducts.products.filter((product) => product.status === 'active').length,
    [customProducts.products],
  );

  const editorOpen = creating || Boolean(editing);
  const openEditor = (product: HostedCustomProduct) => {
    setCreating(false);
    setEditing(product);
  };
  const useProduct = (product: HostedCustomProduct) => {
    const layer = customProducts.useProduct(product);
    if (!layer) return;
    if (onProductUse) {
      if (onProductUse(layer)) {
        consumeCustomProductForecastHandoff(customProducts.premiumActive || isBuiltInCustomProduct(product));
        setApplicationError(null);
      } else {
        consumeCustomProductForecastHandoff(customProducts.premiumActive || isBuiltInCustomProduct(product));
        setApplicationError(`Remove a custom layer before loading this product (maximum ${CUSTOM_PRODUCT_LIMITS.layersPerCollection}).`);
      }
      return;
    }
    navigate('/forecast');
  };

  return (
    <main className={`custom-products-page${embedded ? ' custom-products-page--dialog' : ''}`}>
      <ProductsHero
        productCount={(customProducts.userProducts ?? customProducts.products.filter((product) => !isBuiltInCustomProduct(product))).length}
        builtInCount={(customProducts.builtInProducts ?? customProducts.products.filter(isBuiltInCustomProduct)).length}
        activeCount={activeCount}
        newDisabled={newProductDisabled(customProducts, editorOpen, user?.uid)}
        onNew={() => { setEditing(null); setCreating(true); }}
      />
      <WorkspaceNotices customProducts={customProducts} applicationError={applicationError} />
      <WorkspaceEditors
        creating={creating}
        editing={editing}
        customProducts={customProducts}
        stopCreating={() => setCreating(false)}
        stopEditing={() => setEditing(null)}
      />
      <ProductsLibrary customProducts={customProducts} editorOpen={editorOpen} onEdit={openEditor} onUse={useProduct} />
    </main>
  );
};

export default CustomProductsWorkspace;
