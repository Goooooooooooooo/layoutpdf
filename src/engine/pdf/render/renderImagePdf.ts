import type { PDFImage } from 'pdf-lib';
import { decodeBase64Asset } from '@/engine/utils/assets.js';
import { mmToPdfPt } from '@/engine/utils/units.js';
import type { ImageNode } from '@/engine/renderTree/model.js';
import type { PdfNodeRenderContext } from '@/engine/pdf/render/types.js';

function decodeDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error('Image dataUrl must contain base64 image data.');
  return {
    mimeType: match[1],
    bytes: decodeBase64Asset({
      kind: 'image',
      name: 'inline-image',
      mimeType: match[1] === 'image/jpeg' ? 'image/jpeg' : 'image/png',
      dataEncoding: 'base64',
      data: match[2],
    }),
  };
}

async function getImage(node: ImageNode, context: PdfNodeRenderContext): Promise<PDFImage> {
  const key = node.assetId ? `asset:${node.assetId}` : `inline:${node.dataUrl}`;
  const cached = context.imageCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    if (node.assetId) {
      const asset = context.assets[node.assetId];
      if (!asset || asset.kind !== 'image') throw new Error(`Image asset not found: ${node.assetId}`);
      const bytes = decodeBase64Asset(asset);
      return asset.mimeType === 'image/jpeg'
        ? context.pdfDoc.embedJpg(bytes)
        : context.pdfDoc.embedPng(bytes);
    }
    if (!node.dataUrl) throw new Error(`Image node "${node.id}" has no image source.`);
    const inline = decodeDataUrl(node.dataUrl);
    return inline.mimeType === 'image/jpeg'
      ? context.pdfDoc.embedJpg(inline.bytes)
      : context.pdfDoc.embedPng(inline.bytes);
  })();
  context.imageCache.set(key, promise);
  return promise;
}

export async function renderImagePdf(node: ImageNode, context: PdfNodeRenderContext): Promise<void> {
  const image = await getImage(node, context);
  const boxWidth = mmToPdfPt(node.box.width);
  const boxHeight = mmToPdfPt(node.box.height);
  const sourceRatio = image.width / image.height;
  let width = boxWidth;
  let height = boxHeight;

  if (node.fit !== 'fill') {
    const contain = node.fit === 'contain';
    const widthFromHeight = boxHeight * sourceRatio;
    const shouldUseHeight = contain ? widthFromHeight <= boxWidth : widthFromHeight >= boxWidth;
    if (shouldUseHeight) {
      width = widthFromHeight;
    } else {
      height = boxWidth / sourceRatio;
    }
  }

  const x = mmToPdfPt(node.box.x) + (boxWidth - width) / 2;
  const y = context.page.getHeight() - mmToPdfPt(node.box.y) - (boxHeight + height) / 2;
  context.page.drawImage(image, { x, y, width, height, opacity: node.opacity });
}
