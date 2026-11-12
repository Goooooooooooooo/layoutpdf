import { z } from 'zod';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';
import {
  createTextNode,
  defaultTextVisualProps,
  textStyleProperties,
  TextVisualPropsSchema,
} from '@/plugins/textShared.js';

export const TextPropsSchema = TextVisualPropsSchema.extend({
  multiline: z.boolean(),
});

export type TextProps = z.infer<typeof TextPropsSchema>;

export const textPlugin: LayoutPDFPlugin<TextProps, string> = {
  metadata: {
    type: 'text',
    label: '文字',
    labelKey: 'plugin.text.label',
    category: 'data',
    bindingValueKind: 'text',
  },
  propsSchema: TextPropsSchema,
  valueSchema: z.string(),
  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'text',
      name: '文字',
      box: { ...position, width: 80, height: 12 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: '',
      binding: { key: `field_${id}`, required: false },
      props: {
        ...defaultTextVisualProps(),
        multiline: true,
      },
    };
  },
  properties: [
    { path: 'value', label: '默认内容', labelKey: 'property.common.defaultContent', editor: 'textarea', group: 'content' },
    { path: 'binding.key', label: '数据字段', labelKey: 'property.binding.key', editor: 'text', group: 'data' },
    { path: 'binding.required', label: '必填', labelKey: 'property.binding.required', editor: 'switch', group: 'data' },
    ...textStyleProperties(),
  ],
  buildRenderNodes({ element, value, context }) {
    return [createTextNode({
      element,
      text: value,
      context,
      input: element.binding ? {
        key: element.binding.key,
        kind: element.props.multiline ? 'multiline' : 'text',
        value,
        required: element.binding.required,
        placeholder: element.name,
      } : undefined,
    })];
  },
};
