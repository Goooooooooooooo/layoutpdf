import { z } from 'zod';
import qrcode from 'qrcode-generator';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';
import { HexColorSchemaPattern, monochromeRasterToPngDataUrl } from '@/plugins/codeShared.js';

export const QrCodePropsSchema = z.object({
  errorCorrection: z.enum(['L', 'M', 'Q', 'H']),
  foreground: z.string().regex(HexColorSchemaPattern),
  background: z.string().regex(HexColorSchemaPattern),
  quietZone: z.number().int().min(0).max(16),
  pixelsPerModule: z.number().int().min(1).max(12),
});

export type QrCodeProps = z.infer<typeof QrCodePropsSchema>;

function createQrDataUrl(
  value: string,
  props: QrCodeProps,
): string {
  const qr = qrcode(0, props.errorCorrection);
  // qrcode-generator's default byte conversion truncates UTF-16 code units.
  // Supplying a binary string keeps UTF-8 content deterministic without
  // mutating the package-wide stringToBytes hook.
  const utf8 = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of utf8) binary += String.fromCharCode(byte);
  qr.addData(binary, 'Byte');
  qr.make();
  const size = qr.getModuleCount();
  const matrix = Array.from({ length: size }, (_, row) =>
    Array.from({ length: size }, (_, column) => qr.isDark(row, column))
  );
  return monochromeRasterToPngDataUrl(matrix, {
    foreground: props.foreground,
    background: props.background,
    scaleX: props.pixelsPerModule,
    scaleY: props.pixelsPerModule,
    quietZoneX: props.quietZone,
    quietZoneY: props.quietZone,
  });
}

export const qrcodePlugin: LayoutPDFPlugin<QrCodeProps, string> = {
  metadata: {
    type: 'qrcode',
    label: '二维码',
    labelKey: 'plugin.qrcode.label',
    category: 'business',
    bindingValueKind: 'text',
  },
  propsSchema: QrCodePropsSchema,
  valueSchema: z.string().max(2048),
  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'qrcode',
      name: '二维码',
      box: { ...position, width: 30, height: 30 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: 'LAYOUTPDF-LAYOUT',
      binding: { key: `field_${id}`, required: false },
      props: {
        errorCorrection: 'M',
        foreground: '#000000',
        background: '#ffffff',
        quietZone: 4,
        pixelsPerModule: 4,
      },
    };
  },
  properties: [
    { path: 'value', label: '默认内容', labelKey: 'property.code.defaultContent', editor: 'textarea', group: 'content' },
    { path: 'binding.key', label: '数据字段', labelKey: 'property.binding.key', editor: 'text', group: 'data' },
    { path: 'binding.required', label: '必填', labelKey: 'property.binding.required', editor: 'switch', group: 'data' },
    {
      path: 'props.errorCorrection',
      label: '纠错等级',
      labelKey: 'property.qrcode.errorCorrection',
      editor: 'select',
      group: 'content',
      options: [
        { label: '低（L）', labelKey: 'property.option.qrLow', value: 'L' },
        { label: '中（M）', labelKey: 'property.option.qrMedium', value: 'M' },
        { label: '较高（Q）', labelKey: 'property.option.qrQuartile', value: 'Q' },
        { label: '高（H）', labelKey: 'property.option.qrHigh', value: 'H' },
      ],
    },
    { path: 'props.quietZone', label: '静区模块数', labelKey: 'property.code.quietZone', editor: 'number', min: 0, max: 16, step: 1, group: 'layout' },
    { path: 'props.pixelsPerModule', label: '模块像素', labelKey: 'property.qrcode.pixelsPerModule', editor: 'number', min: 1, max: 12, step: 1, group: 'advanced' },
    { path: 'props.foreground', label: '前景色', labelKey: 'property.code.foreground', editor: 'color', group: 'style' },
    { path: 'props.background', label: '背景色', labelKey: 'property.code.background', editor: 'color', group: 'style' },
  ],
  buildRenderNodes({ element, value, context }) {
    let dataUrl = monochromeRasterToPngDataUrl([[false]], {
      foreground: element.props.foreground,
      background: element.props.background,
      scaleX: 1,
      scaleY: 1,
      quietZoneX: 0,
      quietZoneY: 0,
    });
    if (value !== '') {
      try {
        dataUrl = createQrDataUrl(value, element.props);
      } catch (error) {
        context.report({
          severity: 'error',
          code: 'QRCODE_ENCODING_FAILED',
          message: error instanceof Error ? error.message : String(error),
          inputKey: element.binding?.key,
        });
      }
    }
    return [{
      kind: 'image',
      id: context.createNodeId('qrcode'),
      sourceElementId: element.id,
      box: { ...element.box },
      rotate: element.rotate,
      opacity: element.opacity,
      clip: true,
      zIndex: 0,
      dataUrl,
      fit: 'contain',
      alt: element.name,
      input: element.binding ? {
        key: element.binding.key,
        kind: 'text',
        value,
        required: element.binding.required,
        placeholder: element.name,
      } : undefined,
    }];
  },
};
