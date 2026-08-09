import { useState } from 'react';
import { LibraryBig } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { isFeatureExposed } from '../../config/featureExposure';
import { addCustomLayer, selectCustomLayer } from '../../store/forecastSlice';
import type { RootState } from '../../store';
import type { OneOffCustomLayer } from '../../types/customProducts';
import { CUSTOM_PRODUCT_LIMITS } from '../../types/customProducts';
import CustomProductsWorkspace from '../../pages/gated/CustomProductsWorkspace';
import './CustomProductsDialog.css';

/** Keeps reusable custom products in the forecast workspace rather than navigating away from in-progress work. */
const CustomProductsDialog = () => {
  const dispatch = useDispatch();
  const [open, setOpen] = useState(false);
  const layerCount = useSelector((state: RootState) => state.forecast.forecastCycle.days[state.forecast.forecastCycle.currentDay]?.customLayers?.layers.length ?? 0);
  if (!isFeatureExposed('customProducts')) return null;

  const useProduct = (layer: OneOffCustomLayer) => {
    if (layerCount >= CUSTOM_PRODUCT_LIMITS.layersPerCollection) return false;
    dispatch(addCustomLayer(layer));
    dispatch(selectCustomLayer(layer.id));
    setOpen(false);
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="custom-products-dialog-trigger">
          <LibraryBig className="h-4 w-4" /> Saved products
        </Button>
      </DialogTrigger>
      <DialogContent className="custom-products-dialog-content">
        <DialogHeader className="custom-products-dialog-header">
          <div className="custom-products-dialog-header__identity">
            <span className="custom-products-dialog-header__icon" aria-hidden="true"><LibraryBig /></span>
            <div>
              <span className="custom-products-dialog-header__eyebrow">Custom library</span>
              <DialogTitle>Saved products</DialogTitle>
            </div>
          </div>
          <DialogDescription>Use the free Rainfall and Tropical AOI products, or apply a personal reusable category set without leaving your workspace.</DialogDescription>
        </DialogHeader>
        <CustomProductsWorkspace embedded onProductUse={useProduct} />
      </DialogContent>
    </Dialog>
  );
};

export default CustomProductsDialog;
