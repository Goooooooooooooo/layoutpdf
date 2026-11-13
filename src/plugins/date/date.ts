import { z } from 'zod';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';
import { formatDateValue } from '@/i18n/formatters.js';
import {
  createTextNode,
  defaultTextVisualProps,
  textStyleProperties,
  TextVisualPropsSchema,
} from '@/plugins/textShared.js';

export const DatePropsSchema = TextVisualPropsSchema.extend({
  era: z.enum(['meiji', 'taisho', 'showa', 'heisei', 'reiwa', 'seireki']),
  format: z.enum(['long', 'short', 'numeric']),
});

export type DateProps = z.infer<typeof DatePropsSchema>;

export const DateValueSchema = z.string().refine(
  value => value === '' || /^\d{4}-\d{2}-\d{2}$/.test(value),
  { message: 'Date must use YYYY-MM-DD format.' },
);

export const datePlugin: LayoutPDFPlugin<DateProps, string> = {
  metadata: {
    type: 'date',
    label: '日期',
    labelKey: 'plugin.date.label',
    category: 'data',
    bindingValueKind: 'date',
  },
  propsSchema: DatePropsSchema,
  valueSchema: DateValueSchema,
  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'date',
      name: '日期',
      box: { ...position, width: 45, height: 10 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: '',
      binding: { key: `field_${id}`, required: false },
      props: {
        ...defaultTextVisualProps({ verticalAlign: 'middle' }),
        era: 'seireki',
        format: 'long',
      },
    };
  },
  properties: [
    { path: 'value', label: '默认日期', labelKey: 'property.common.defaultDate', editor: 'text', group: 'content' },
    { path: 'binding.key', label: '数据字段', labelKey: 'property.binding.key', editor: 'text', group: 'data' },
    { path: 'binding.required', label: '必填', labelKey: 'property.binding.required', editor: 'switch', group: 'data' },
    {
      path: 'props.era',
      label: '纪年',
      labelKey: 'property.date.era',
      editor: 'select',
      group: 'content',
      options: [
        { label: '西历', labelKey: 'property.option.dateSeireki', value: 'seireki' },
        { label: '令和', labelKey: 'property.option.dateReiwa', value: 'reiwa' },
        { label: '平成', labelKey: 'property.option.dateHeisei', value: 'heisei' },
        { label: '昭和', labelKey: 'property.option.dateShowa', value: 'showa' },
        { label: '大正', labelKey: 'property.option.dateTaisho', value: 'taisho' },
        { label: '明治', labelKey: 'property.option.dateMeiji', value: 'meiji' },
      ],
    },
    {
      path: 'props.format',
      label: '格式',
      labelKey: 'property.date.format',
      editor: 'select',
      group: 'content',
      options: [
        { label: '长格式', labelKey: 'property.option.dateLong', value: 'long' },
        { label: '短格式', labelKey: 'property.option.dateShort', value: 'short' },
        { label: '数字', labelKey: 'property.option.dateNumeric', value: 'numeric' },
      ],
    },
    ...textStyleProperties(),
  ],
  buildRenderNodes({ element, value, context }) {
    return [createTextNode({
      element,
      text: formatDateValue(value, {
        locale: context.format.locale,
        calendar: element.props.era === 'seireki' ? 'gregory' : 'japanese',
        era: element.props.era,
        format: element.props.format,
      }),
      context,
      input: element.binding ? {
        key: element.binding.key,
        kind: 'date',
        value,
        required: element.binding.required,
        placeholder: element.name,
      } : undefined,
    })];
  },
};
