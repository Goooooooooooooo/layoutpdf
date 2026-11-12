import {
  createId,
  type IdGenerator,
  type TemplateFile,
} from '@/engine/core/document.js';
import { encodeBase64Asset } from '@/engine/utils/assets.js';

export function createTemplateFileFromPdf(args: {
  name: string;
  bytes: Uint8Array;
  pageSizes: Array<{ width: number; height: number }>;
  idGenerator?: IdGenerator;
}): TemplateFile {
  if (args.pageSizes.length === 0) throw new Error('PDF must contain at least one page.');
  const idGenerator = args.idGenerator ?? createId;
  const assetId = idGenerator('asset');
  return {
    format: 'layoutpdf-template',
    version: 3,
    assets: {
      [assetId]: {
        kind: 'pdf',
        name: args.name,
        mimeType: 'application/pdf',
        dataEncoding: 'base64',
        data: encodeBase64Asset(args.bytes),
      },
    },
    template: {
      version: 3,
      id: idGenerator('tpl'),
      name: args.name.replace(/\.pdf$/i, '') || 'PDF Template',
      pages: args.pageSizes.map((size, pageIndex) => ({
        id: idGenerator('page'),
        size: { ...size },
        padding: [10, 10, 10, 10],
        background: { kind: 'pdf', assetId, pageIndex },
        elements: [],
      })),
    },
  };
}
