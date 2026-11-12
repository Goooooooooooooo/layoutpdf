import { z } from 'zod';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';
import { formatNumberValue } from '@/i18n/formatters.js';
import {
  createTextNode,
  defaultTextVisualProps,
  textStyleProperties,
  TextVisualPropsSchema,
} from '@/plugins/textShared.js';

export const NumberPropsSchema = TextVisualPropsSchema.extend({
  decimalPlaces: z.number().int().min(0).max(10),
  prefix: z.string(),
  suffix: z.string(),
});

export type NumberProps = z.infer<typeof NumberPropsSchema>;
export const NumberValueSchema = z.union([z.number(), z.string()]);
export type NumberValue = z.infer<typeof NumberValueSchema>;

export const numberPlugin: LayoutPDFPlugin<NumberProps, NumberValue> = {
  metadata: {
    type: 'number',
    label: '数值',
    labelKey: 'plugin.number.label',
    category: 'data',
    bindingValueKind: 'number',
  },
  propsSchema: NumberPropsSchema,
  valueSchema: NumberValueSchema,
  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'number',
      name: '数值',
      box: { ...position, width: 50, height: 10 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: '',
      binding: { key: `field_${id}`, required: false },
      props: {
        ...defaultTextVisualProps({ align: 'right', verticalAlign: 'middle' }),
        decimalPlaces: 0,
        prefix: '',
        suffix: '',
      },
    };
  },
  properties: [
    { path: 'value', label: '默认值', labelKey: 'property.common.defaultNumber', editor: 'number', group: 'content' },
    { path: 'binding.key', label: '数据字段', labelKey: 'property.binding.key', editor: 'text', group: 'data' },
    { path: 'binding.required', label: '必填', labelKey: 'property.binding.required', editor: 'switch', group: 'data' },
    { path: 'props.decimalPlaces', label: '小数位', labelKey: 'property.common.decimalPlaces', editor: 'number', min: 0, max: 10, group: 'content' },
    { path: 'props.prefix', label: '前缀', labelKey: 'property.common.prefix', editor: 'text', group: 'content' },
    { path: 'props.suffix', label: '后缀', labelKey: 'property.common.suffix', editor: 'text', group: 'content' },
    ...textStyleProperties(),
  ],
  buildRenderNodes({ element, value, context }) {
    const text = value === ''
      ? ''
      : `${element.props.prefix}${formatNumberValue(value, {
        mode: 'number',
        locale: context.format.locale,
        decimalPlaces: element.props.decimalPlaces,
        fallback: 'raw',
      })}${element.props.suffix}`;
    return [createTextNode({
      element,
      text,
      context,
      input: element.binding ? {
        key: element.binding.key,
        kind: 'number',
        value,
        required: element.binding.required,
        placeholder: element.name,
      } : undefined,
    })];
  },
};
