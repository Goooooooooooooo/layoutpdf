import { z } from 'zod';
import type { ElementBox } from '@/engine/core/document.js';
import type { PropertyDefinition, RenderBuildContext } from '@/engine/core/plugin.js';
import type { RenderInput, TextNode } from '@/engine/renderTree/model.js';

export const BorderSchema = z.object({
  width: z.number().nonnegative().default(0),
  color: z.string().default('#000000'),
  style: z.enum(['solid', 'dashed', 'dotted']).default('solid'),
});

export const BORDER_STYLE_OPTIONS: Array<{ label: string; labelKey: string; value: 'solid' | 'dashed' | 'dotted' }> = [
  { label: '实线', labelKey: 'property.option.borderSolid', value: 'solid' },
  { label: '虚线', labelKey: 'property.option.borderDashed', value: 'dashed' },
  { label: '点线', labelKey: 'property.option.borderDotted', value: 'dotted' },
];

export const TextVisualPropsSchema = z.object({
  fontName: z.string(),
  fontSize: z.number().positive(),
  color: z.string(),
  fontWeight: z.enum(['normal', 'bold']),
  align: z.enum(['left', 'center', 'right']),
  verticalAlign: z.enum(['top', 'middle', 'bottom']),
  lineHeight: z.number().positive(),
  padding: z.tuple([
    z.number().nonnegative(),
    z.number().nonnegative(),
    z.number().nonnegative(),
    z.number().nonnegative(),
  ]),
  backgroundColor: z.string().optional(),
  border: BorderSchema.optional(),
});

export type TextVisualProps = z.infer<typeof TextVisualPropsSchema>;

export function defaultTextVisualProps(
  overrides: Partial<TextVisualProps> = {},
): TextVisualProps {
  return {
    fontName: '',
    fontSize: 12,
    color: '#000000',
    fontWeight: 'normal',
    align: 'left',
    verticalAlign: 'middle',
    lineHeight: 1.2,
    padding: [2, 2, 2, 2],
    border: { width: 0, color: '#000000', style: 'solid' },
    ...overrides,
  };
}

export function textStyleProperties(): PropertyDefinition[] {
  return [
    { path: 'props.fontSize', label: '字号', labelKey: 'property.common.fontSize', editor: 'stepper', min: 6, max: 72, step: 1, group: 'style' },
    { path: 'props.color', label: '文字色', labelKey: 'property.common.textColor', editor: 'color', group: 'style' },
    {
      path: 'props.fontWeight',
      label: '字重',
      labelKey: 'property.common.fontWeight',
      editor: 'button-group',
      group: 'style',
      options: [
        { label: '标准', labelKey: 'property.option.fontNormal', value: 'normal' },
        { label: '粗体', labelKey: 'property.option.fontBold', value: 'bold' },
      ],
    },
    {
      path: 'props.align',
      label: '水平对齐',
      labelKey: 'property.common.horizontalAlign',
      editor: 'button-group',
      group: 'style',
      options: [
        { label: '左', labelKey: 'property.option.alignLeft', value: 'left', icon: 'align-left' },
        { label: '中', labelKey: 'property.option.alignCenter', value: 'center', icon: 'align-center-horizontal' },
        { label: '右', labelKey: 'property.option.alignRight', value: 'right', icon: 'align-right' },
      ],
    },
    {
      path: 'props.verticalAlign',
      label: '垂直对齐',
      labelKey: 'property.common.verticalAlign',
      editor: 'button-group',
      group: 'style',
      options: [
        { label: '上', labelKey: 'property.option.alignTop', value: 'top', icon: 'align-top' },
        { label: '中', labelKey: 'property.option.alignMiddle', value: 'middle', icon: 'align-center-vertical' },
        { label: '下', labelKey: 'property.option.alignBottom', value: 'bottom', icon: 'align-bottom' },
      ],
    },
    { path: 'props.lineHeight', label: '行高', labelKey: 'property.common.lineHeight', editor: 'number', min: 0.5, max: 3, step: 0.1, group: 'style' },
    { path: 'props.backgroundColor', label: '背景色', labelKey: 'property.common.backgroundColor', editor: 'color', group: 'style' },
    { path: 'props.border.color', label: '边框色', labelKey: 'property.common.borderColor', editor: 'color', group: 'style' },
    { path: 'props.border.width', label: '边框宽度', labelKey: 'property.common.borderWidth', editor: 'number', min: 0, max: 20, step: 0.5, group: 'style' },
    {
      path: 'props.border.style',
      label: '边框样式',
      labelKey: 'property.common.borderStyle',
      editor: 'select',
      group: 'style',
      options: BORDER_STYLE_OPTIONS,
    },
  ];
}

interface TextNodeElement {
  id: string;
  box: ElementBox;
  rotate: number;
  opacity: number;
  props: TextVisualProps;
}

export function createTextNode(args: {
  element: TextNodeElement;
  text: string;
  context: RenderBuildContext;
  input?: RenderInput;
  localId?: string;
  numericFormula?: TextNode['numericFormula'];
  fieldReference?: TextNode['fieldReference'];
}): TextNode {
  const { element } = args;
  return {
    kind: 'text',
    id: args.context.createNodeId(args.localId ?? 'text'),
    sourceElementId: element.id,
    box: { ...element.box },
    rotate: element.rotate,
    opacity: element.opacity,
    clip: true,
    zIndex: 0,
    input: args.input ? { ...args.input } : undefined,
    text: args.text,
    numericFormula: args.numericFormula ? { ...args.numericFormula } : undefined,
    fieldReference: args.fieldReference ? { ...args.fieldReference } : undefined,
    style: {
      fontName: element.props.fontName || undefined,
      fontSize: element.props.fontSize,
      color: element.props.color,
      fontWeight: element.props.fontWeight,
      align: element.props.align,
      verticalAlign: element.props.verticalAlign,
      lineHeight: element.props.lineHeight,
      padding: [...element.props.padding],
      backgroundColor: element.props.backgroundColor,
      border: element.props.border?.width ? BorderSchema.parse(element.props.border) : undefined,
    },
    layout: { lines: [], lineHeightMm: 0, overflow: false },
  };
}
