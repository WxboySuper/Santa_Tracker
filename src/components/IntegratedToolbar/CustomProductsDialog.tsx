import { useState } from 'react';
import { ArrowUpRight, Check, LibraryBig, Sparkles } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
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
import { useAuth } from '../../auth/AuthProvider';
import { useEntitlement } from '../../billing/EntitlementProvider';
import './CustomProductsDialog.css';

/** A light-touch upgrade prompt shown only to signed-in free users in the forecast workspace. */
const CustomProductsUpgradePrompt = ({ onViewPremium }: { onViewPremium(): void }) => (
  <section className="custom-products-upgrade-prompt" aria-labelledby="custom-products-upgrade-title">
    <span className="custom-products-upgrade-prompt__icon" aria-hidden="true"><Sparkles /></span>
    <div className="custom-products-upgrade-prompt__copy">
      <span>Premium feature</span>
      <h3 id="custom-products-upgrade-title">Save a product, use it whenever.</h3>
      <p>Premium lets you keep a category set ready for the next forecast, without rebuilding it each time.</p>
    </div>
    <ul>
      <li><Check aria-hidden="true" /> Save reusable category sets</li>
      <li><Check aria-hidden="true" /> Add them to a forecast in one click</li>
    </ul>
    <Button asChild className="custom-products-upgrade-prompt__action">
      <Link to="/account" onClick={onViewPremium}>View Premium <ArrowUpRight aria-hidden="true" /></Link>
    </Button>
    <p className="custom-products-upgrade-prompt__note">You can keep drawing custom layers without Premium.</p>
  </section>
);

/** Keeps reusable custom products in the forecast workspace rather than navigating away from in-progress work. */
const CustomProductsDialog = () => {
  const dispatch = useDispatch();
  const { user } = useAuth();
  const { premiumActive } = useEntitlement();
  const [open, setOpen] = useState(false);
  const layerCount = useSelector((state: RootState) => state.forecast.forecastCycle.days[state.forecast.forecastCycle.currentDay]?.customLayers?.layers.length ?? 0);
  const showUpgradePrompt = Boolean(user && !premiumActive);

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
      <DialogContent className={`custom-products-dialog-content${showUpgradePrompt ? ' custom-products-dialog-content--upgrade' : ''}`}>
        <DialogHeader className="custom-products-dialog-header">
          <div className="custom-products-dialog-header__identity">
            <span className="custom-products-dialog-header__icon" aria-hidden="true"><LibraryBig /></span>
            <div>
              <span className="custom-products-dialog-header__eyebrow">Custom library</span>
              <DialogTitle>Saved products</DialogTitle>
            </div>
          </div>
          <DialogDescription>{showUpgradePrompt
            ? 'Build custom layers now, then save reusable category sets with Premium.'
            : 'Apply a reusable category set to this forecast without leaving your workspace.'}</DialogDescription>
        </DialogHeader>
        {showUpgradePrompt
          ? <CustomProductsUpgradePrompt onViewPremium={() => setOpen(false)} />
          : <CustomProductsWorkspace embedded onProductUse={useProduct} />}
      </DialogContent>
    </Dialog>
  );
};

export default CustomProductsDialog;
