import { z } from 'zod';
import { getBase64AssetByteLength } from '@/engine/utils/assets.js';
import type {
  LayoutPDFTemplate,
  JsonValue,
  TemplateElement,
  TemplateFile,
} from '@/engine/core/document.js';
import type { ValidationIssue } from '@/engine/utils/errors.js';
import { LayoutPDFValidationError } from '@/engine/utils/errors.js';
import { validateTemplateComplexity } from '@/engine/utils/limits.js';
import { readTablePaginationElementReferences } from '@/engine/core/tablePaginationReferences.js';

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(JsonValueSchema),
  z.record(z.string(), JsonValueSchema),
]));

export const ElementBoxSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
});

export const InputBindingSchema = z.object({
  key: z.string().trim().min(1),
  required: z.boolean().optional(),
});

export const TemplateElementSchema: z.ZodType<TemplateElement> = z.object({
  id: z.string().trim().min(1),
  type: z.string().trim().min(1),
  name: z.string(),
  box: ElementBoxSchema,
  rotate: z.number().finite().min(-180).max(180),
  opacity: z.number().finite().min(0).max(1),
  locked: z.boolean(),
  hidden: z.boolean(),
  presetId: z.string().trim().min(1).optional(),
  groupId: z.string().trim().min(1).optional(),
  value: JsonValueSchema,
  binding: InputBindingSchema.optional(),
  props: z.record(z.string(), JsonValueSchema),
});

export const PageBackgroundSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('blank'),
    color: z.string().optional(),
  }),
  z.object({
    kind: z.literal('pdf'),
    assetId: z.string().trim().min(1),
    pageIndex: z.number().int().nonnegative(),
  }),
]);

export const TemplatePageSchema = z.object({
  id: z.string().trim().min(1),
  size: z.object({
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
  }),
  padding: z.tuple([
    z.number().finite().nonnegative(),
    z.number().finite().nonnegative(),
    z.number().finite().nonnegative(),
    z.number().finite().nonnegative(),
  ]),
  background: PageBackgroundSchema,
  elements: z.array(TemplateElementSchema),
});

export const DocumentTemplateSchema: z.ZodType<LayoutPDFTemplate> = z.object({
  version: z.literal(3),
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  metadata: z.object({
    title: z.string().optional(),
    author: z.string().optional(),
    subject: z.string().optional(),
    language: z.string().optional(),
  }).optional(),
  pages: z.array(TemplatePageSchema).min(1),
});

export const TemplateAssetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('pdf'),
    name: z.string(),
    mimeType: z.literal('application/pdf'),
    dataEncoding: z.literal('base64'),
    data: z.string().min(1),
  }),
  z.object({
    kind: z.literal('image'),
    name: z.string(),
    mimeType: z.union([z.literal('image/png'), z.literal('image/jpeg')]),
    dataEncoding: z.literal('base64'),
    data: z.string().min(1),
  }),
]);

export const TemplateFileSchema: z.ZodType<TemplateFile> = z.object({
  format: z.literal('layoutpdf-template'),
  version: z.literal(3),
  template: DocumentTemplateSchema,
  assets: z.record(z.string(), TemplateAssetSchema),
});

function issueFromZod(issue: z.core.$ZodIssue): ValidationIssue {
  return {
    severity: 'error',
    code: 'INVALID_DOCUMENT_STRUCTURE',
    message: issue.message,
    path: issue.path.length > 0 ? issue.path.join('.') : 'root',
    zodCode: issue.code,
  };
}

function findSemanticDocumentIssues(file: TemplateFile): ValidationIssue[] {
  const issues: ValidationIssue[] = validateTemplateComplexity(file);
  const pageIds = new Set<string>();
  const elementIds = new Set<string>();
  const groupPages = new Map<string, string>();

  for (const [assetId, asset] of Object.entries(file.assets)) {
    try {
      getBase64AssetByteLength(asset);
    } catch (error) {
      issues.push({
        severity: 'error',
        code: 'INVALID_ASSET_DATA',
        message: error instanceof Error ? error.message : String(error),
        path: `assets.${assetId}.data`,
      });
    }
  }

  for (const page of file.template.pages) {
    if (pageIds.has(page.id)) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_PAGE_ID',
        message: `Duplicate page id: ${page.id}`,
        pageId: page.id,
      });
    }
    pageIds.add(page.id);

    const [paddingTop, paddingRight, paddingBottom, paddingLeft] = page.padding;
    if (paddingLeft + paddingRight >= page.size.width || paddingTop + paddingBottom >= page.size.height) {
      issues.push({
        severity: 'error',
        code: 'PAGE_PADDING_EXCEEDS_SIZE',
        message: `Page padding leaves no usable content area: ${page.id}`,
        pageId: page.id,
      });
    }

    if (page.background.kind === 'pdf') {
      const asset = file.assets[page.background.assetId];
      if (!asset) {
        issues.push({
          severity: 'error',
          code: 'MISSING_BACKGROUND_ASSET',
          message: `Background asset not found: ${page.background.assetId}`,
          pageId: page.id,
        });
      } else if (asset.kind !== 'pdf') {
        issues.push({
          severity: 'error',
          code: 'INVALID_BACKGROUND_ASSET_TYPE',
          message: `Background asset must be a PDF: ${page.background.assetId}`,
          pageId: page.id,
        });
      }
    }

    for (const element of page.elements) {
      if (elementIds.has(element.id)) {
        issues.push({
          severity: 'error',
          code: 'DUPLICATE_ELEMENT_ID',
          message: `Duplicate element id: ${element.id}`,
          pageId: page.id,
          elementId: element.id,
        });
      }
      elementIds.add(element.id);
      if (element.groupId) {
        const existingPageId = groupPages.get(element.groupId);
        if (existingPageId && existingPageId !== page.id) {
          issues.push({
            severity: 'error',
            code: 'ELEMENT_GROUP_SPANS_PAGES',
            message: `Element group must stay on one page: ${element.groupId}`,
            pageId: page.id,
            elementId: element.id,
          });
        } else {
          groupPages.set(element.groupId, page.id);
        }
      }
    }

    const groupCounts = new Map<string, number>();
    page.elements.forEach(element => {
      if (element.groupId) {
        groupCounts.set(element.groupId, (groupCounts.get(element.groupId) ?? 0) + 1);
      }
    });
    for (const [groupId, count] of groupCounts) {
      if (count < 2) {
        issues.push({
          severity: 'error',
          code: 'ELEMENT_GROUP_REQUIRES_MULTIPLE_MEMBERS',
          message: `Element group must contain at least two elements: ${groupId}`,
          pageId: page.id,
        });
      }
    }

    const pageElements = new Map(page.elements.map(element => [element.id, element]));
    const finalReferenceOwners = new Map<string, string>();
    for (const element of page.elements) {
      if (element.type !== 'table') continue;
      const references = readTablePaginationElementReferences(element);
      const finalReferences = new Set<string>();
      for (const [field, elementIds] of Object.entries(references)) {
        const seen = new Set<string>();
        for (const referencedElementId of elementIds) {
          if (seen.has(referencedElementId)) {
            issues.push({
              severity: 'error',
              code: 'INVALID_TABLE_PAGINATION_REFERENCE',
              message: 'Table pagination content cannot contain duplicate element references.',
              path: `template.pages.${page.id}.elements.${element.id}.props.pagination.${field}`,
              pageId: page.id,
              elementId: element.id,
            });
            continue;
          }
          seen.add(referencedElementId);
          if (field === 'repeatElementIds' && finalReferences.has(referencedElementId)) {
            issues.push({
              severity: 'error',
              code: 'INVALID_TABLE_PAGINATION_REFERENCE',
              message: 'An element cannot be both final-page and repeated content.',
              path: `template.pages.${page.id}.elements.${element.id}.props.pagination.${field}`,
              pageId: page.id,
              elementId: element.id,
            });
            continue;
          }
          const referencedElement = pageElements.get(referencedElementId);
          const invalidReason = referencedElementId === element.id
            ? 'A table cannot reference itself as pagination content.'
            : !referencedElement
              ? 'Table pagination content must exist on the same page.'
              : referencedElement.type === 'table'
                ? 'A table cannot use another table as pagination content.'
                : undefined;
          if (invalidReason) {
            issues.push({
              severity: 'error',
              code: 'INVALID_TABLE_PAGINATION_REFERENCE',
              message: invalidReason,
              path: `template.pages.${page.id}.elements.${element.id}.props.pagination.${field}`,
              pageId: page.id,
              elementId: element.id,
            });
            continue;
          }
          if (field !== 'finalElementIds') continue;
          finalReferences.add(referencedElementId);
          const existingOwner = finalReferenceOwners.get(referencedElementId);
          if (existingOwner && existingOwner !== element.id) {
            issues.push({
              severity: 'error',
              code: 'INVALID_TABLE_PAGINATION_REFERENCE',
              message: 'Final-page content can belong to only one table on a page.',
              path: `template.pages.${page.id}.elements.${element.id}.props.pagination.${field}`,
              pageId: page.id,
              elementId: element.id,
            });
          } else {
            finalReferenceOwners.set(referencedElementId, element.id);
          }
        }
      }
    }
    for (const element of page.elements) {
      if (element.type !== 'summary') continue;
      const summaryProps = element.props as Record<string, unknown>;
      const items = Array.isArray(summaryProps.items) ? summaryProps.items : [];
      const refs = new Set<string>();
      for (const [index, rawItem] of items.entries()) {
        if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) continue;
        const source = rawItem.source;
        if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
        const sourceElementId = typeof source.sourceElementId === 'string'
          ? source.sourceElementId
          : '';
        const outputId = typeof source.outputId === 'string' ? source.outputId : '';
        const refKey = `${sourceElementId}\u0000${outputId}`;
        if (refs.has(refKey)) {
          issues.push({
            severity: 'error',
            code: 'DUPLICATE_ELEMENT_OUTPUT_REFERENCE',
            message: 'Summary block contains a duplicate output reference.',
            path: `template.pages.${page.id}.elements.${element.id}.props.items.${index}.source`,
            pageId: page.id,
            elementId: element.id,
          });
        }
        refs.add(refKey);
        const sourceElement = pageElements.get(sourceElementId);
        if (!sourceElement) {
          issues.push({
            severity: 'error',
            code: 'INVALID_ELEMENT_OUTPUT_SOURCE',
            message: `Summary output source must be on the same page: ${sourceElementId}.`,
            path: `template.pages.${page.id}.elements.${element.id}.props.items.${index}.source`,
            pageId: page.id,
            elementId: element.id,
          });
          continue;
        }
        if (sourceElement.type !== 'table') continue;
        const tableProps = sourceElement.props as Record<string, unknown>;
        const footers = Array.isArray(tableProps.footers)
          ? tableProps.footers
          : [];
        const hasFooter = footers.some(footer =>
          footer
          && typeof footer === 'object'
          && !Array.isArray(footer)
          && footer.id === outputId
        );
        if (!hasFooter) {
          issues.push({
            severity: 'error',
            code: 'INVALID_ELEMENT_OUTPUT_ID',
            message: `Summary output does not match a table footer: ${outputId}.`,
            path: `template.pages.${page.id}.elements.${element.id}.props.items.${index}.source.outputId`,
            pageId: page.id,
            elementId: element.id,
          });
        }
      }
    }
  }

  return issues;
}

export function validateTemplateFile(value: unknown): ValidationIssue[] {
  const parsed = TemplateFileSchema.safeParse(value);
  if (!parsed.success) return parsed.error.issues.map(issueFromZod);
  return findSemanticDocumentIssues(parsed.data);
}

export function assertValidTemplateFile(value: unknown): asserts value is TemplateFile {
  const issues = validateTemplateFile(value);
  if (issues.some(issue => issue.severity === 'error')) {
    throw new LayoutPDFValidationError('Invalid LayoutPDF template file', issues);
  }
}

export function validateDocumentTemplate(value: unknown): ValidationIssue[] {
  const parsed = DocumentTemplateSchema.safeParse(value);
  if (!parsed.success) return parsed.error.issues.map(issueFromZod);
  return findSemanticDocumentIssues({
    format: 'layoutpdf-template',
    version: 3,
    template: parsed.data,
    assets: {},
  }).filter(issue => issue.code !== 'MISSING_BACKGROUND_ASSET');
}
