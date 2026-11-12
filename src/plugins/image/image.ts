import { z } from 'zod';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';

export const ImagePropsSchema = z.object({
  fit: z.enum(['contain', 'cover', 'fill']),
  alt: z.string(),
});

export const ImageValueSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('asset'), assetId: z.string().min(1) }),
  z.object({ source: z.literal('dataUrl'), dataUrl: z.string() }),
]);

export type ImageProps = z.infer<typeof ImagePropsSchema>;
export type ImageValue = z.infer<typeof ImageValueSchema>;

export const imagePlugin: LayoutPDFPlugin<ImageProps, ImageValue> = {
  metadata: { type: 'image', label: '图片', labelKey: 'plugin.image.label', category: 'basic' },
  propsSchema: ImagePropsSchema,
  valueSchema: ImageValueSchema,
  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'image',
      name: '图片',
      box: { ...position, width: 40, height: 30 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: { source: 'dataUrl', dataUrl: '' },
      props: { fit: 'contain', alt: '' },
    };
  },
  properties: [
    { path: 'value', label: '图片资源', labelKey: 'property.image.source', editor: 'asset', group: 'content' },
    {
      path: 'props.fit',
      label: '适应方式',
      labelKey: 'property.image.fit',
      editor: 'select',
      group: 'layout',
      options: [
        { label: '完整显示', labelKey: 'property.option.fitContain', value: 'contain' },
        { label: '填满裁切', labelKey: 'property.option.fitCover', value: 'cover' },
        { label: '拉伸填满', labelKey: 'property.option.fitFill', value: 'fill' },
      ],
    },
    { path: 'props.alt', label: '替代文字', labelKey: 'property.image.alt', editor: 'text', group: 'advanced' },
  ],
  buildRenderNodes({ element, value, context }) {
    return [{
      kind: 'image',
      id: context.createNodeId('image'),
      sourceElementId: element.id,
      box: { ...element.box },
      rotate: element.rotate,
      opacity: element.opacity,
      clip: true,
      zIndex: 0,
      assetId: value.source === 'asset' ? value.assetId : undefined,
      dataUrl: value.source === 'dataUrl' && value.dataUrl ? value.dataUrl : undefined,
      fit: element.props.fit,
      alt: element.props.alt,
    }];
  },
};
