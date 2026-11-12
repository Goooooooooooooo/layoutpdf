import { z } from 'zod';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';
import { BORDER_STYLE_OPTIONS } from '@/plugins/textShared.js';

export const LinePropsSchema = z.object({
  color: z.string(),
  width: z.number().positive(),
  style: z.enum(['solid', 'dashed', 'dotted']),
});

export type LineProps = z.infer<typeof LinePropsSchema>;

export const linePlugin: LayoutPDFPlugin<LineProps, null> = {
  metadata: { type: 'line', label: '直线', labelKey: 'plugin.line.label', category: 'layout' },
  propsSchema: LinePropsSchema,
  valueSchema: z.null(),
  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'line',
      name: '直线',
      box: { ...position, width: 60, height: 2 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: null,
      props: { color: '#999999', width: 1, style: 'solid' },
    };
  },
  properties: [
    { path: 'props.color', label: '颜色', labelKey: 'property.common.color', editor: 'color', group: 'style' },
    { path: 'props.width', label: '线宽', labelKey: 'property.line.width', editor: 'number', min: 0.1, max: 20, step: 0.1, group: 'style' },
    {
      path: 'props.style',
      label: '样式',
      labelKey: 'property.line.style',
      editor: 'select',
      group: 'style',
      options: BORDER_STYLE_OPTIONS,
    },
  ],
  buildRenderNodes({ element, context }) {
    return [{
      kind: 'line',
      id: context.createNodeId('line'),
      sourceElementId: element.id,
      box: { ...element.box },
      rotate: element.rotate,
      opacity: element.opacity,
      clip: false,
      zIndex: 0,
      from: { x: 0, y: element.box.height / 2 },
      to: { x: element.box.width, y: element.box.height / 2 },
      width: element.props.width,
      color: element.props.color,
      style: element.props.style,
    }];
  },
};
