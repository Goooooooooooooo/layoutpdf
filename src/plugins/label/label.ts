import { z } from 'zod';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';
import {
  createTextNode,
  defaultTextVisualProps,
  textStyleProperties,
  TextVisualPropsSchema,
  type TextVisualProps,
} from '@/plugins/textShared.js';

export const labelPlugin: LayoutPDFPlugin<TextVisualProps, string> = {
  metadata: { type: 'label', label: '标签', labelKey: 'plugin.label.label', category: 'basic' },
  propsSchema: TextVisualPropsSchema,
  valueSchema: z.string(),
  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'label',
      name: '标签',
      box: { ...position, width: 60, height: 10 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: 'ラベル',
      props: defaultTextVisualProps({ verticalAlign: 'middle' }),
    };
  },
  properties: [
    { path: 'value', label: '内容', labelKey: 'property.label.content', editor: 'textarea', group: 'content' },
    ...textStyleProperties(),
  ],
  buildRenderNodes({ element, value, context }) {
    return [createTextNode({ element, text: value, context })];
  },
};
