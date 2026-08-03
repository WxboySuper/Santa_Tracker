import type { CustomCategoryTemplate } from '../../types/customProducts';
import { categoryPreviewStyle } from './customProductEditorModel';

const CustomProductPreview = ({ categories }: { categories: CustomCategoryTemplate[] }) => (
  <div className="custom-product-preview" aria-label="Product preview">
    {categories.map((category) => (
      <div className="custom-product-preview__item" key={category.id}>
        <span
          className={`custom-product-preview__swatch hatch-${category.style.hatch}`}
          style={categoryPreviewStyle(category)}
        />
        <span>{category.label || 'Untitled category'}</span>
      </div>
    ))}
  </div>
);

export default CustomProductPreview;
