import { z } from 'zod';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';
import {
  createTextNode,
  defaultTextVisualProps,
  textStyleProperties,
  TextVisualPropsSchema,
} from '@/plugins/textShared.js';

export const CalcPropsSchema = TextVisualPropsSchema.extend({
  format: z.enum(['number', 'currency']),
  prefix: z.string(),
  suffix: z.string(),
  decimalPlaces: z.number().int().min(0).max(10),
  negativeStyle: z.enum([
    'minus-after-symbol',
    'minus-before-symbol',
    'parentheses',
    'triangle',
  ]).default('minus-after-symbol'),
});

export type CalcProps = z.infer<typeof CalcPropsSchema>;

export const calcPlugin: LayoutPDFPlugin<CalcProps, string> = {
  metadata: { type: 'calc', label: '计算', labelKey: 'plugin.calc.label', category: 'business' },
  propsSchema: CalcPropsSchema,
  valueSchema: z.string(),
  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'calc',
      name: '计算',
      box: { ...position, width: 55, height: 10 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: '0',
      props: {
        ...defaultTextVisualProps({ align: 'right', verticalAlign: 'middle' }),
        format: 'currency',
        prefix: '¥',
        suffix: '',
        decimalPlaces: 0,
        negativeStyle: 'minus-after-symbol',
      },
    };
  },
  properties: [
    { path: 'value', label: '公式', labelKey: 'property.calc.formula', editor: 'text', group: 'content' },
    {
      path: 'props.format',
      label: '显示格式',
      labelKey: 'property.calc.display',
      editor: 'select',
      group: 'content',
      options: [
        { label: '数值', labelKey: 'property.option.calcNumber', value: 'number' },
        { label: '金额', labelKey: 'property.option.calcCurrency', value: 'currency' },
      ],
    },
    { path: 'props.prefix', label: '前缀', labelKey: 'property.common.prefix', editor: 'text', group: 'content' },
    { path: 'props.suffix', label: '后缀', labelKey: 'property.common.suffix', editor: 'text', group: 'content' },
    { path: 'props.decimalPlaces', label: '小数位', labelKey: 'property.common.decimalPlaces', editor: 'number', min: 0, max: 10, group: 'content' },
    {
      path: 'props.negativeStyle',
      label: '负数样式',
      labelKey: 'property.common.negativeStyle',
      editor: 'select',
      group: 'content',
      options: [
        { label: '¥-1,000', labelKey: 'property.option.negativeMinusAfterSymbol', value: 'minus-after-symbol' },
        { label: '-¥1,000', labelKey: 'property.option.negativeMinusBeforeSymbol', value: 'minus-before-symbol' },
        { label: '(¥1,000)', labelKey: 'property.option.negativeParentheses', value: 'parentheses' },
        { label: '▲¥1,000', labelKey: 'property.option.negativeTriangle', value: 'triangle' },
      ],
    },
    ...textStyleProperties(),
  ],
  buildRenderNodes({ element, value, context }) {
    return [createTextNode({
      element,
      text: '',
      context,
      numericFormula: {
        expression: value,
        format: element.props.format,
        prefix: element.props.prefix,
        suffix: element.props.suffix,
        decimalPlaces: element.props.decimalPlaces,
        negativeStyle: element.props.negativeStyle,
      },
    })];
  },
};
