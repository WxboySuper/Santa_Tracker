import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { CUSTOM_PRODUCT_LIMITS, type CustomCategoryTemplate, type CustomHatchPattern } from '../../types/customProducts';

interface Props {
  category: CustomCategoryTemplate;
  index: number;
  count: number;
  onChange(category: CustomCategoryTemplate): void;
  onMove(direction: -1 | 1): void;
  onRemove(): void;
}

const styleChange = (
  category: CustomCategoryTemplate,
  change: Partial<CustomCategoryTemplate['style']>,
): CustomCategoryTemplate => ({ ...category, style: { ...category.style, ...change } });

const CustomProductCategoryEditor = ({ category, index, count, onChange, onMove, onRemove }: Props) => (
  <div className="custom-product-category-editor">
    <div className="custom-product-category-editor__topline">
      <strong>Category {index + 1}</strong>
      <div className="custom-product-category-editor__actions">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${category.label} up`} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move ${category.label} down`} disabled={index === count - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${category.label}`} disabled={count === 1} onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
    <Input aria-label={`Category ${index + 1} label`} maxLength={CUSTOM_PRODUCT_LIMITS.labelLength} value={category.label} onChange={(event) => onChange({ ...category, label: event.target.value })} />
    <div className="custom-product-category-editor__style-grid">
      <label><span>Fill</span><input type="color" aria-label={`Category ${index + 1} fill color`} value={category.style.fillColor} onChange={(event) => onChange(styleChange(category, { fillColor: event.target.value }))} /></label>
      <label><span>Opacity</span><input type="range" aria-label={`Category ${index + 1} opacity`} min="0" max="1" step="0.05" value={category.style.fillOpacity} onChange={(event) => onChange(styleChange(category, { fillOpacity: Number(event.target.value) }))} /></label>
      <label><span>Stroke</span><input type="color" aria-label={`Category ${index + 1} stroke color`} value={category.style.strokeColor} onChange={(event) => onChange(styleChange(category, { strokeColor: event.target.value }))} /></label>
      <label><span>Stroke opacity</span><input type="range" aria-label={`Category ${index + 1} stroke opacity`} min="0" max="1" step="0.05" value={category.style.strokeOpacity} onChange={(event) => onChange(styleChange(category, { strokeOpacity: Number(event.target.value) }))} /></label>
      <label><span>Stroke width</span><input type="range" aria-label={`Category ${index + 1} stroke width`} min="0" max="8" step="0.5" value={category.style.strokeWidth} onChange={(event) => onChange(styleChange(category, { strokeWidth: Number(event.target.value) }))} /></label>
      <label><span>Hatch</span><select aria-label={`Category ${index + 1} hatch`} value={category.style.hatch} onChange={(event) => onChange(styleChange(category, { hatch: event.target.value as CustomHatchPattern }))}><option value="none">None</option><option value="diagonal">Diagonal</option><option value="reverse-diagonal">Reverse diagonal</option><option value="crosshatch">Crosshatch</option></select></label>
    </div>
  </div>
);

export default CustomProductCategoryEditor;
