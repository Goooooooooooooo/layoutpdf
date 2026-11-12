import { z } from 'zod';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';
import { BorderSchema, BORDER_STYLE_OPTIONS, createTextNode, defaultTextVisualProps } from '@/plugins/textShared.js';

export const CheckboxPropsSchema = z.object({
  mark: z.enum(['check', 'cross', 'dot']),
  markColor: z.string(),
  markSize: z.number().positive().max(72),
  checkedFill: z.string().nullable(),
  uncheckedFill: z.string().nullable(),
  border: BorderSchema,
});

export type CheckboxProps = z.infer<typeof CheckboxPropsSchema>;

const MARKS: Record<CheckboxProps['mark'], string> = {
  check: '✓',
  cross: '×',
  dot: '●',
};

export const checkboxPlugin: LayoutPDFPlugin<CheckboxProps, boolean> = {
  metadata: {
    type: 'checkbox',
    label: '复选框',
    labelKey: 'plugin.checkbox.label',
    category: 'data',
    bindingValueKind: 'boolean',
  },
  propsSchema: CheckboxPropsSchema,
  valueSchema: z.boolean(),
  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'checkbox',
      name: '复选框',
      box: { ...position, width: 8, height: 8 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: false,
      binding: { key: `field_${id}`, required: false },
      props: {
        mark: 'check',
        markColor: '#292b29',
        markSize: 14,
        checkedFill: '#ffffff',
        uncheckedFill: '#ffffff',
        border: { width: 1, color: '#292b29', style: 'solid' },
      },
    };
  },
  properties: [
    { path: 'value', label: '默认选中', labelKey: 'property.checkbox.defaultChecked', editor: 'switch', group: 'content' },
    { path: 'binding.key', label: '数据字段', labelKey: 'property.binding.key', editor: 'text', group: 'data' },
    { path: 'binding.required', label: '必须选中', labelKey: 'property.checkbox.requiredChecked', editor: 'switch', group: 'data' },
    {
      path: 'props.mark',
      label: '选中标记',
      labelKey: 'property.checkbox.markType',
      editor: 'select',
      group: 'style',
      options: [
        { label: '勾选', labelKey: 'property.option.checkboxCheck', value: 'check' },
        { label: '交叉', labelKey: 'property.option.checkboxCross', value: 'cross' },
        { label: '圆点', labelKey: 'property.option.checkboxDot', value: 'dot' },
      ],
    },
    { path: 'props.markColor', label: '标记颜色', labelKey: 'property.checkbox.markColor', editor: 'color', group: 'style' },
    { path: 'props.markSize', label: '标记字号', labelKey: 'property.checkbox.markSize', editor: 'number', min: 6, max: 72, group: 'style' },
    { path: 'props.checkedFill', label: '选中填充', labelKey: 'property.checkbox.checkedFill', editor: 'color', group: 'style', cleareable: true },
    { path: 'props.uncheckedFill', label: '未选填充', labelKey: 'property.checkbox.uncheckedFill', editor: 'color', group: 'style', cleareable: true },
    { path: 'props.border.color', label: '边框色', labelKey: 'property.common.borderColor', editor: 'color', group: 'style' },
    { path: 'props.border.width', label: '边框宽度', labelKey: 'property.common.borderWidth', editor: 'number', min: 0, max: 20, step: 0.1, group: 'style' },
    {
      path: 'props.border.style',
      label: '边框样式',
      labelKey: 'property.common.borderStyle',
      editor: 'select',
      group: 'style',
      options: BORDER_STYLE_OPTIONS,
    },
  ],
  buildRenderNodes({ element, value, context }) {
    const box = {
      kind: 'rect' as const,
      id: context.createNodeId('box'),
      sourceElementId: element.id,
      box: { ...element.box },
      rotate: element.rotate,
      opacity: element.opacity,
      clip: false,
      zIndex: 0,
      fill: (value ? element.props.checkedFill : element.props.uncheckedFill) ?? undefined,
      border: BorderSchema.parse(element.props.border),
    };
    const mark = createTextNode({
      element: {
        id: element.id,
        box: { ...element.box },
        rotate: element.rotate,
        opacity: element.opacity,
        props: defaultTextVisualProps({
          fontSize: element.props.markSize,
          color: element.props.markColor,
          align: 'center',
          verticalAlign: 'middle',
          padding: [0, 0, 0, 0],
          border: undefined,
        }),
      },
      text: value ? MARKS[element.props.mark] : '',
      context,
      input: element.binding ? {
        key: element.binding.key,
        kind: 'checkbox',
        value,
        required: element.binding.required,
        placeholder: element.name,
      } : undefined,
    });
    return [box, mark];
  },
};
