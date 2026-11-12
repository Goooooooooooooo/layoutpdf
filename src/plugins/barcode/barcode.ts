import { z } from 'zod';
import type { LayoutPDFPlugin } from '@/engine/core/plugin.js';
import type { RenderNode } from '@/engine/renderTree/model.js';
import { HexColorSchemaPattern, monochromeRasterToPngDataUrl } from '@/plugins/codeShared.js';
import {
  createTextNode,
  defaultTextVisualProps,
  textStyleProperties,
  TextVisualPropsSchema,
} from '@/plugins/textShared.js';
import { rotateChildBox } from '@/plugins/geometryShared.js';

const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
] as const;

export const BarcodePropsSchema = TextVisualPropsSchema.extend({
  format: z.literal('code128'),
  showText: z.boolean(),
  foreground: z.string().regex(HexColorSchemaPattern),
  background: z.string().regex(HexColorSchemaPattern),
  quietZone: z.number().int().min(0).max(40),
  modulePixels: z.number().int().min(1).max(8),
  barHeightPixels: z.number().int().min(16).max(160),
});

export type BarcodeProps = z.infer<typeof BarcodePropsSchema>;
export const BarcodeValueSchema = z.string().max(80).refine(
  value => value === '' || /^[\x20-\x7e]+$/.test(value),
  'Code 128B supports printable ASCII characters only.',
);

function code128Modules(value: string): boolean[] {
  const values = Array.from(value, character => character.charCodeAt(0) - 32);
  const checksum = (104 + values.reduce((total, code, index) => total + code * (index + 1), 0)) % 103;
  const codes = [104, ...values, checksum, 106];
  const modules: boolean[] = [];
  for (const code of codes) {
    let bar = true;
    for (const widthCharacter of CODE128_PATTERNS[code]) {
      const width = Number(widthCharacter);
      modules.push(...Array.from({ length: width }, () => bar));
      bar = !bar;
    }
  }
  return modules;
}

function createBarcodeDataUrl(value: string, props: BarcodeProps): string {
  return monochromeRasterToPngDataUrl([code128Modules(value)], {
    foreground: props.foreground,
    background: props.background,
    scaleX: props.modulePixels,
    scaleY: props.barHeightPixels,
    quietZoneX: props.quietZone,
    quietZoneY: 0,
  });
}

export const barcodePlugin: LayoutPDFPlugin<BarcodeProps, string> = {
  metadata: {
    type: 'barcode',
    label: '条形码',
    labelKey: 'plugin.barcode.label',
    category: 'business',
    bindingValueKind: 'text',
  },
  propsSchema: BarcodePropsSchema,
  valueSchema: BarcodeValueSchema,
  createDefaultElement({ id, position }) {
    return {
      id,
      type: 'barcode',
      name: '条形码',
      box: { ...position, width: 60, height: 24 },
      rotate: 0,
      opacity: 1,
      locked: false,
      hidden: false,
      value: 'LAYOUTPDF-100001',
      binding: { key: `field_${id}`, required: false },
      props: {
        ...defaultTextVisualProps({ align: 'center', verticalAlign: 'middle', fontSize: 9 }),
        format: 'code128',
        showText: true,
        foreground: '#000000',
        background: '#ffffff',
        quietZone: 10,
        modulePixels: 2,
        barHeightPixels: 48,
      },
    };
  },
  properties: [
    { path: 'value', label: '默认内容', labelKey: 'property.code.defaultContent', editor: 'text', group: 'content' },
    { path: 'binding.key', label: '数据字段', labelKey: 'property.binding.key', editor: 'text', group: 'data' },
    { path: 'binding.required', label: '必填', labelKey: 'property.binding.required', editor: 'switch', group: 'data' },
    { path: 'props.showText', label: '显示文字', labelKey: 'property.barcode.showText', editor: 'switch', group: 'content' },
    { path: 'props.quietZone', label: '静区模块数', labelKey: 'property.code.quietZone', editor: 'number', min: 0, max: 40, step: 1, group: 'layout' },
    { path: 'props.modulePixels', label: '模块像素', labelKey: 'property.barcode.modulePixels', editor: 'number', min: 1, max: 8, step: 1, group: 'advanced' },
    { path: 'props.barHeightPixels', label: '条码像素高度', labelKey: 'property.barcode.barHeightPixels', editor: 'number', min: 16, max: 160, step: 4, group: 'advanced' },
    { path: 'props.foreground', label: '前景色', labelKey: 'property.code.foreground', editor: 'color', group: 'style' },
    { path: 'props.background', label: '背景色', labelKey: 'property.code.background', editor: 'color', group: 'style' },
    ...textStyleProperties(),
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
        dataUrl = createBarcodeDataUrl(value, element.props);
      } catch (error) {
        context.report({
          severity: 'error',
          code: 'BARCODE_ENCODING_FAILED',
          message: error instanceof Error ? error.message : String(error),
          inputKey: element.binding?.key,
        });
      }
    }
    const textHeight = element.props.showText ? Math.min(6, element.box.height * 0.3) : 0;
    const imageBox = rotateChildBox({
      ...element.box,
      height: Math.max(0.1, element.box.height - textHeight),
    }, element.box, element.rotate);
    const nodes: RenderNode[] = [{
      kind: 'image' as const,
      id: context.createNodeId('barcode'),
      sourceElementId: element.id,
      box: imageBox,
      rotate: element.rotate,
      opacity: element.opacity,
      clip: true,
      zIndex: 0,
      dataUrl,
      fit: 'fill' as const,
      alt: element.name,
      input: element.binding ? {
        key: element.binding.key,
        kind: 'text' as const,
        value,
        required: element.binding.required,
        placeholder: element.name,
      } : undefined,
    }];
    if (element.props.showText) {
      nodes.push(createTextNode({
        element: {
          ...element,
          box: rotateChildBox({
            x: element.box.x,
            y: element.box.y + element.box.height - textHeight,
            width: element.box.width,
            height: textHeight,
          }, element.box, element.rotate),
          props: {
            ...element.props,
            padding: [0, 0, 0, 0],
            border: undefined,
            backgroundColor: undefined,
          },
        },
        text: value,
        context: {
          ...context,
          createNodeId: () => context.createNodeId('text'),
        },
      }));
    }
    return nodes;
  },
};
