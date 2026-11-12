import { z } from 'zod';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';
import type { EllipseNode, RectNode, RenderInput, RenderNode } from '@/engine/renderTree/model.js';
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
import { rotateChildBox } from '@/plugins/geometryShared.js';

export const RadioGroupPropsSchema = TextVisualPropsSchema.extend({
  options: ChoiceOptionsSchema,
  direction: z.enum(['horizontal', 'vertical']),
  markerShape: z.enum(['circle', 'square']),
  markerSize: z.number().positive().max(20),
  gap: z.number().min(0).max(20),
  markerColor: z.string(),
});

export type RadioGroupProps = z.infer<typeof RadioGroupPropsSchema>;

function markerNode(args: {
  element: ReturnType<typeof radioGroupPlugin.createDefaultElement>;
  id: string;
  box: RectNode['box'];
  selected: boolean;
}): RectNode | EllipseNode {
  const base = {
    id: args.id,
    sourceElementId: args.element.id,
    box: args.box,
    rotate: args.element.rotate,
    opacity: args.element.opacity,
    clip: false,
    zIndex: 0,
    fill: args.selected ? args.element.props.markerColor : '#ffffff',
    border: { width: 1, color: args.element.props.markerColor, style: 'solid' as const },
  };
  return args.element.props.markerShape === 'circle'
    ? { ...base, kind: 'ellipse' }
    : { ...base, kind: 'rect', radius: 0.5 };
}

export const radioGroupPlugin: LayoutPDFPlugin<RadioGroupProps, string> = {
  metadata: {
    type: 'radiogroup',
    label: '单选组',
    labelKey: 'plugin.radioGroup.label',
    category: 'data',
    bindingValueKind: 'text',
  },
  propsSchema: RadioGroupPropsSchema,
  valueSchema: z.string().max(200),
  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'radiogroup',
      name: '单选组',
      box: { ...position, width: 80, height: 12 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: 'option_1',
      binding: { key: `field_${id}`, required: false },
      props: {
        ...defaultTextVisualProps({ verticalAlign: 'middle' }),
        options: [
          { label: '选项一', value: 'option_1' },
          { label: '选项二', value: 'option_2' },
        ],
        direction: 'horizontal',
        markerShape: 'circle',
        markerSize: 4,
        gap: 1.5,
        markerColor: '#292b29',
      },
    };
  },
  properties: [
    { path: 'value', label: '默认选项', labelKey: 'property.choice.defaultValue', editor: 'text', group: 'content' },
    { path: 'props.options', label: '选项', labelKey: 'property.choice.options', editor: 'choiceOptions', group: 'content' },
    {
      path: 'props.direction',
      label: '排列方向',
      labelKey: 'property.radioGroup.direction',
      editor: 'button-group',
      group: 'layout',
      options: [
        { label: '横向', labelKey: 'property.option.horizontal', value: 'horizontal' },
        { label: '纵向', labelKey: 'property.option.vertical', value: 'vertical' },
      ],
    },
    {
      path: 'props.markerShape',
      label: '标记形状',
      labelKey: 'property.radioGroup.markerShape',
      editor: 'select',
      group: 'style',
      options: [
        { label: '圆形', labelKey: 'property.option.circle', value: 'circle' },
        { label: '方形', labelKey: 'property.option.square', value: 'square' },
      ],
    },
    { path: 'props.markerSize', label: '标记尺寸', labelKey: 'property.radioGroup.markerSize', editor: 'number', min: 2, max: 20, step: 0.5, group: 'layout' },
    { path: 'props.gap', label: '标记间距', labelKey: 'property.radioGroup.gap', editor: 'number', min: 0, max: 20, step: 0.5, group: 'layout' },
    { path: 'props.markerColor', label: '标记颜色', labelKey: 'property.radioGroup.markerColor', editor: 'color', group: 'style' },
    { path: 'binding.key', label: '数据字段', labelKey: 'property.binding.key', editor: 'text', group: 'data' },
    { path: 'binding.required', label: '必填', labelKey: 'property.binding.required', editor: 'switch', group: 'data' },
    ...textStyleProperties(),
  ],
  buildRenderNodes({ element, value, context }) {
    resolveChoiceLabel({
      value,
      options: element.props.options,
      placeholder: '',
      context,
      inputKey: element.binding?.key,
    });
    const input: RenderInput | undefined = element.binding ? {
      key: element.binding.key,
      kind: 'radio',
      value,
      required: element.binding.required,
      placeholder: element.name,
      options: cloneChoiceOptions(element.props.options),
    } : undefined;
    const optionCount = element.props.options.length;
    const slotWidth = element.props.direction === 'horizontal'
      ? element.box.width / optionCount
      : element.box.width;
    const slotHeight = element.props.direction === 'vertical'
      ? element.box.height / optionCount
      : element.box.height;
    const markerSize = Math.min(element.props.markerSize, slotHeight);
    const nodes: RenderNode[] = [];

    element.props.options.forEach((option, index) => {
      const slotX = element.box.x + (element.props.direction === 'horizontal' ? index * slotWidth : 0);
      const slotY = element.box.y + (element.props.direction === 'vertical' ? index * slotHeight : 0);
      const markerBox = rotateChildBox({
        x: slotX,
        y: slotY + Math.max(0, (slotHeight - markerSize) / 2),
        width: markerSize,
        height: markerSize,
      }, element.box, element.rotate);
      nodes.push(markerNode({
        element,
        id: context.createNodeId(`marker-${index}`),
        box: markerBox,
        selected: option.value === value,
      }));
      nodes.push(createTextNode({
        element: {
          ...element,
          box: rotateChildBox({
            x: slotX,
            y: slotY,
            width: slotWidth,
            height: slotHeight,
          }, element.box, element.rotate),
          props: {
            ...element.props,
            padding: [0, 0, 0, markerSize + element.props.gap],
            border: undefined,
            backgroundColor: undefined,
          },
        },
        text: option.label,
        context: {
          ...context,
          createNodeId: () => context.createNodeId(`label-${index}`),
        },
        input: input ? { ...input, optionValue: option.value } : undefined,
      }));
    });
    return nodes;
  },
};
