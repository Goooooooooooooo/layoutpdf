import { z } from 'zod';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';
import { BorderSchema, BORDER_STYLE_OPTIONS } from '@/plugins/textShared.js';

export const RectPropsSchema = z.object({
  fill: z.string().optional().nullable(),
  border: BorderSchema,
});

export type RectProps = z.infer<typeof RectPropsSchema>;

export const rectPlugin: LayoutPDFPlugin<RectProps, null> = {
  metadata: { type: 'rect', label: '矩形', labelKey: 'plugin.rect.label', category: 'layout' },
  propsSchema: RectPropsSchema,
  valueSchema: z.null(),
  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'rect',
      name: '矩形',
      box: { ...position, width: 60, height: 20 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: null,
      props: {
        fill: '#f5f5f5',
        border: { width: 0.5, color: '#999999', style: 'solid' },
      },
    };
  },
  properties: [
    { path: 'props.fill', label: '填充色', labelKey: 'property.common.fill', editor: 'color', group: 'style', cleareable: true },
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
  buildRenderNodes({ element, context }) {
    return [{
      kind: 'rect',
      id: context.createNodeId('rect'),
      sourceElementId: element.id,
      box: { ...element.box },
      rotate: element.rotate,
      opacity: element.opacity,
      clip: false,
      zIndex: 0,
      fill: element.props.fill ?? undefined,
      border: BorderSchema.parse(element.props.border),
    }];
  },
};
