import { z } from 'zod';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';
import { formatNumberValue } from '@/i18n/formatters.js';
import {
  createTextNode,
  defaultTextVisualProps,
  textStyleProperties,
  TextVisualPropsSchema,
} from '@/plugins/textShared.js';

export const CurrencyPropsSchema = TextVisualPropsSchema.extend({
  prefix: z.string(),
  suffix: z.string(),
  decimalPlaces: z.number().int().min(0).max(10),
  source: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('ownValue') }),
    z.object({ kind: z.literal('field'), key: z.string().default('') }),
  ]).default({ kind: 'ownValue' }),
  symbolLayout: z.enum(['attached', 'edge']).default('attached'),
});

export type CurrencyProps = z.infer<typeof CurrencyPropsSchema>;
export const CurrencyValueSchema = z.union([z.number(), z.string()]);
export type CurrencyValue = z.infer<typeof CurrencyValueSchema>;

export const currencyPlugin: LayoutPDFPlugin<CurrencyProps, CurrencyValue> = {
  metadata: {
    type: 'currency',
    label: '金额',
    labelKey: 'plugin.currency.label',
    category: 'business',
    bindingValueKind: 'number',
  },
  propsSchema: CurrencyPropsSchema,
  valueSchema: CurrencyValueSchema,
  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'currency',
      name: '金额',
      box: { ...position, width: 55, height: 10 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: '',
      binding: { key: `field_${id}`, required: false },
      props: {
        ...defaultTextVisualProps({ align: 'right', verticalAlign: 'middle' }),
        prefix: '¥',
        suffix: '',
        decimalPlaces: 0,
        source: { kind: 'ownValue' },
        symbolLayout: 'attached',
      },
    };
  },
  properties: [
    { path: 'value', label: '默认金额', labelKey: 'property.currency.defaultValue', editor: 'number', group: 'content' },
    { path: 'binding.key', label: '数据字段', labelKey: 'property.binding.key', editor: 'text', group: 'data' },
    { path: 'binding.required', label: '必填', labelKey: 'property.binding.required', editor: 'switch', group: 'data' },
    { path: 'props.prefix', label: '货币符号', labelKey: 'property.currency.prefix', editor: 'text', group: 'content' },
    { path: 'props.suffix', label: '后缀', labelKey: 'property.common.suffix', editor: 'text', group: 'content' },
    { path: 'props.decimalPlaces', label: '小数位', labelKey: 'property.common.decimalPlaces', editor: 'number', min: 0, max: 10, group: 'content' },
    {
      path: 'props.source.kind',
      label: '数值来源',
      labelKey: 'property.currency.source',
      editor: 'select',
      group: 'data',
      options: [
        { label: '自身值', labelKey: 'property.currency.sourceOwn', value: 'ownValue' },
        { label: '指定字段', labelKey: 'property.currency.sourceField', value: 'field' },
      ],
    },
    { path: 'props.source.key', label: '引用字段', labelKey: 'property.currency.sourceFieldKey', editor: 'text', group: 'data' },
    {
      path: 'props.symbolLayout',
      label: '货币符号布局',
      labelKey: 'property.currency.symbolLayout',
      editor: 'select',
      group: 'content',
      options: [
        { label: '紧贴数字', labelKey: 'property.currency.symbolAttached', value: 'attached' },
        { label: '左边缘', labelKey: 'property.currency.symbolEdge', value: 'edge' },
      ],
    },
    ...textStyleProperties(),
  ],
  buildRenderNodes({ element, value, context }) {
    const source = element.props.source ?? { kind: 'ownValue' as const };
    const symbolLayout = element.props.symbolLayout ?? 'attached';
    const fieldReference = source.kind === 'field' ? {
      key: source.key,
      prefix: symbolLayout === 'attached' ? element.props.prefix : '',
      suffix: element.props.suffix,
      decimalPlaces: element.props.decimalPlaces,
    } : undefined;
    const text = source.kind === 'field' ? '' : value === '' ? '' : formatNumberValue(value, {
      mode: 'currency',
      locale: context.format.locale,
      prefix: element.props.prefix,
      suffix: element.props.suffix,
      decimalPlaces: element.props.decimalPlaces,
      fallback: 'raw',
    });
    const input = source.kind === 'ownValue' && element.binding ? {
        key: element.binding.key,
        kind: 'number',
        value,
        required: element.binding.required,
        placeholder: element.name,
      } as const : undefined;
    if (symbolLayout === 'attached') {
      return [createTextNode({ element, text, context, input, fieldReference })];
    }
    const prefixElement = {
      ...element,
      props: { ...element.props, align: 'left' as const },
    };
    const valueElement = {
      ...element,
      props: {
        ...element.props,
        align: 'right' as const,
        backgroundColor: undefined,
        border: undefined,
      },
    };
    return [
      createTextNode({ element: prefixElement, text: element.props.prefix, context, localId: 'currency-prefix' }),
      createTextNode({
        element: valueElement,
        text: source.kind === 'ownValue' && value !== '' ? formatNumberValue(value, {
          mode: 'number',
          locale: context.format.locale,
          prefix: '',
          suffix: element.props.suffix,
          decimalPlaces: element.props.decimalPlaces,
          fallback: 'raw',
        }) : '',
        context,
        input,
        fieldReference,
        localId: 'currency-value',
      }),
    ];
  },
};
