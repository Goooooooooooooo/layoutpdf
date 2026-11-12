import { z } from 'zod';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';
import {
  createTextNode,
  defaultTextVisualProps,
  textStyleProperties,
  TextVisualPropsSchema,
} from '@/plugins/textShared.js';
import {
  ChoiceOptionsSchema,
  cloneChoiceOptions,
  resolveChoiceLabel,
} from '@/plugins/choiceShared.js';

export const SelectPropsSchema = TextVisualPropsSchema.extend({
  options: ChoiceOptionsSchema,
  placeholder: z.string().max(200),
});

export type SelectProps = z.infer<typeof SelectPropsSchema>;

export const selectPlugin: LayoutPDFPlugin<SelectProps, string> = {
  metadata: {
    type: 'select',
    label: '下拉选择',
    labelKey: 'plugin.select.label',
    category: 'data',
    bindingValueKind: 'text',
  },
  propsSchema: SelectPropsSchema,
  valueSchema: z.string().max(200),
  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'select',
      name: '下拉选择',
      box: { ...position, width: 55, height: 10 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: '',
      binding: { key: `field_${id}`, required: false },
      props: {
        ...defaultTextVisualProps({ verticalAlign: 'middle' }),
        options: [
          { label: '选项一', value: 'option_1' },
          { label: '选项二', value: 'option_2' },
        ],
        placeholder: '请选择',
      },
    };
  },
  properties: [
    { path: 'value', label: '默认选项', labelKey: 'property.choice.defaultValue', editor: 'text', group: 'content' },
    { path: 'props.options', label: '选项', labelKey: 'property.choice.options', editor: 'choiceOptions', group: 'content' },
    { path: 'props.placeholder', label: '未选择文字', labelKey: 'property.choice.placeholder', editor: 'text', group: 'content' },
    { path: 'binding.key', label: '数据字段', labelKey: 'property.binding.key', editor: 'text', group: 'data' },
    { path: 'binding.required', label: '必填', labelKey: 'property.binding.required', editor: 'switch', group: 'data' },
    ...textStyleProperties(),
  ],
  buildRenderNodes({ element, value, context }) {
    const options = cloneChoiceOptions(element.props.options);
    const text = resolveChoiceLabel({
      value,
      options: element.props.options,
      placeholder: element.props.placeholder,
      context,
      inputKey: element.binding?.key,
    });
    return [createTextNode({
      element,
      text,
      context,
      input: element.binding ? {
        key: element.binding.key,
        kind: 'select',
        value,
        required: element.binding.required,
        placeholder: element.name,
        options,
      } : undefined,
    })];
  },
};
