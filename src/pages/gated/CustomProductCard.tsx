import { useState } from 'react';
import { Archive, Copy, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import type { HostedCustomProduct } from '../../types/customProducts';
import CustomProductPreview from './CustomProductPreview';

interface Props {
  product: HostedCustomProduct;
  premiumActive: boolean;
  pending: boolean;
  onEdit(): void;
  onDuplicate(): void;
  onStatus(): void;
  onDelete(): void;
  onUse(): void;
}

const DeleteAction = ({ pending, onDelete }: { pending: boolean; onDelete(): void }) => {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <Button variant="ghost" onClick={() => setConfirming(true)} disabled={pending}><Trash2 className="mr-2 h-4 w-4" /> Delete</Button>;
  }
  return (
    <div className="custom-product-delete-confirm">
      <span>Delete permanently?</span>
      <Button variant="ghost" onClick={() => setConfirming(false)}>Keep</Button>
      <Button variant="destructive" onClick={onDelete} disabled={pending}>Delete</Button>
    </div>
  );
};

const ProductActions = ({ product, premiumActive, pending, onEdit, onDuplicate, onStatus, onDelete, onUse }: Props) => {
  const active = product.status === 'active';
  const mutationsDisabled = pending || !premiumActive;
  return (
    <div className="custom-product-card__actions">
      <Button onClick={onUse} disabled={mutationsDisabled || !active}>Use in Forecast</Button>
      <Button variant="outline" onClick={onEdit} disabled={mutationsDisabled || !active}><Pencil className="mr-2 h-4 w-4" /> Edit</Button>
      <Button variant="outline" onClick={onDuplicate} disabled={mutationsDisabled}><Copy className="mr-2 h-4 w-4" /> Duplicate</Button>
      <Button variant="outline" onClick={onStatus} disabled={mutationsDisabled}>
        {active ? <Archive className="mr-2 h-4 w-4" /> : <RotateCcw className="mr-2 h-4 w-4" />}
        {active ? 'Archive' : 'Restore'}
      </Button>
      <DeleteAction pending={pending} onDelete={onDelete} />
    </div>
  );
};

const CustomProductCard = (props: Props) => {
  const { product } = props;
  return (
    <Card className="custom-product-card">
      <CardHeader>
        <div className="custom-product-card__heading">
          <div>
            <CardTitle>{product.label}</CardTitle>
            <CardDescription>{product.description || `${product.categories.length} ordered categories`}</CardDescription>
          </div>
          <span className={`custom-product-status is-${product.status}`}>{product.status}</span>
        </div>
      </CardHeader>
      <CardContent>
        <CustomProductPreview categories={product.categories} />
        <div className="custom-product-card__meta">Version {product.version} · Updated {new Date(product.updatedAt).toLocaleDateString()}</div>
        <ProductActions {...props} />
      </CardContent>
    </Card>
  );
};

export default CustomProductCard;
