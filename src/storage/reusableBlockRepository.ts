import type { TemplateAsset, TemplateElement } from '@/engine/core/document.js';

export interface ReusableBlock {
  version: 1;
  id: string;
  name: string;
  elements: TemplateElement<object>[];
  assets: Record<string, TemplateAsset>;
  createdAt: string;
}
