import type { TemplateFile, TemplateElement } from '@/engine/core/document.js';
import type { RenderIssue } from '@/engine/utils/errors.js';
import type { FontManager } from '@/engine/pdf/font/fontManager.js';
import type { InputRecord } from '@/engine/core/input.js';
import { isMissingRequiredInput, resolveElementValue } from '@/engine/core/input.js';
import type { PluginRegistry, RenderBuildContext } from '@/engine/core/plugin.js';
import { JsonValueSchema, TemplateFileSchema, validateTemplateFile } from '@/engine/core/validation.js';
import type { RenderDocument, RenderNode, RenderPage } from '@/engine/renderTree/model.js';
import {
  resolveFormatLocaleSettings,
  type FormatLocaleSettings,
} from '@/i18n/locales.js';
import { resolveFormulaFields } from '@/engine/renderTree/fieldReferences.js';
import {
  computeProducerNodes,
  resolveOutputBindings,
} from '@/engine/renderTree/outputReferences.js';

export interface ResolveRenderTreeArgs {
  file: TemplateFile;
  input: InputRecord;
  plugins: PluginRegistry;
  fontManager: FontManager;
  /**
   * Engine-level overrides for document locale, currency, calendar, and time
   * zone. Template metadata provides the base values.
   */
  format?: Partial<FormatLocaleSettings>;
}

function withLocation(
  issue: RenderIssue,
  pageId: string,
  elementId?: string,
): RenderIssue {
  return {
    ...issue,
    pageId: issue.pageId ?? pageId,
    elementId: issue.elementId ?? elementId,
  };
}

function validateBuiltNode(
  node: RenderNode,
  element: TemplateElement<object>,
  assets: TemplateFile['assets'],
): RenderIssue[] {
  const issues: RenderIssue[] = [];

  if (!node.id.trim()) {
    issues.push({ severity: 'error', code: 'INVALID_RENDER_NODE_ID', message: 'Render node id is required.' });
  }
  if (node.sourceElementId !== element.id) {
    issues.push({
      severity: 'error',
      code: 'INVALID_RENDER_NODE_SOURCE',
      message: `Render node source must be element ${element.id}.`,
    });
  }
  if (
    !Number.isFinite(node.box.x) ||
    !Number.isFinite(node.box.y) ||
    !Number.isFinite(node.box.width) ||
    !Number.isFinite(node.box.height) ||
    node.box.width <= 0 ||
    node.box.height <= 0
  ) {
    issues.push({ severity: 'error', code: 'INVALID_RENDER_NODE_BOX', message: 'Render node box is invalid.' });
  }
  if (!Number.isFinite(node.rotate) || node.rotate < -180 || node.rotate > 180) {
    issues.push({ severity: 'error', code: 'INVALID_RENDER_NODE_ROTATE', message: 'Render node rotation is invalid.' });
  }
  if (!Number.isFinite(node.opacity) || node.opacity < 0 || node.opacity > 1) {
    issues.push({ severity: 'error', code: 'INVALID_RENDER_NODE_OPACITY', message: 'Render node opacity is invalid.' });
  }
  if (node.kind === 'image') {
    if (!node.assetId && !node.dataUrl) {
      issues.push({ severity: 'error', code: 'MISSING_IMAGE_SOURCE', message: 'Image source is required.' });
    } else if (node.assetId) {
      const asset = assets[node.assetId];
      if (!asset) {
        issues.push({ severity: 'error', code: 'MISSING_IMAGE_ASSET', message: `Image asset not found: ${node.assetId}` });
      } else if (asset.kind !== 'image') {
        issues.push({ severity: 'error', code: 'INVALID_IMAGE_ASSET', message: `Asset is not an image: ${node.assetId}` });
      }
    } else if (!/^data:image\/(?:png|jpeg);base64,/i.test(node.dataUrl ?? '')) {
      issues.push({ severity: 'error', code: 'INVALID_IMAGE_DATA_URL', message: 'Inline image must be a PNG or JPEG base64 data URL.' });
    }
  }

  if (node.kind === 'plugin') {
    if (!node.pluginType?.trim()) {
      issues.push({
        severity: 'error',
        code: 'INVALID_PLUGIN_NODE',
        message: 'Plugin node requires a non-empty pluginType.',
      });
    }
    if (!JsonValueSchema.safeParse(node.payload).success) {
      issues.push({
        severity: 'error',
        code: 'INVALID_PLUGIN_NODE',
        message: 'Plugin node payload must be JSON serializable.',
      });
    }
    if (node.textRuns && node.textRuns.some(run => typeof run.text !== 'string')) {
      issues.push({
        severity: 'error',
        code: 'INVALID_PLUGIN_NODE',
        message: 'Plugin node textRuns must contain string text.',
      });
    }
  }

  return issues;
}

function resolvePage(
  page: TemplateFile['template']['pages'][number],
  fileAssets: TemplateFile['assets'],
  input: InputRecord,
  plugins: PluginRegistry,
  fontManager: FontManager,
  format: RenderDocument['format'],
  issues: RenderIssue[],
): RenderPage {
  const nodes: RenderNode[] = [];
  const nodeIds = new Set<string>();
  const resolvedInput: InputRecord = { ...input };
  for (const element of page.elements) {
    if (
      element.binding
      && !Object.prototype.hasOwnProperty.call(resolvedInput, element.binding.key)
      && element.value !== undefined
    ) {
      resolvedInput[element.binding.key] = element.value;
    }
  }

  for (let elementIndex = 0; elementIndex < page.elements.length; elementIndex++) {
    const element = page.elements[elementIndex];
    if (element.hidden) continue;

    const pluginIssues = plugins.validateElement(element);
    issues.push(...pluginIssues.map(issue => withLocation(issue, page.id, element.id)));
    if (pluginIssues.some(issue => issue.severity === 'error')) continue;

    const plugin = plugins.get(element.type);
    if (!plugin) continue;

    if (element.binding?.required && isMissingRequiredInput(resolvedInput, element.binding.key)) {
      issues.push({
        severity: 'error',
        code: 'MISSING_REQUIRED_INPUT',
        message: `Required input is missing: ${element.binding.key}`,
        pageId: page.id,
        elementId: element.id,
        inputKey: element.binding.key,
      });
    }

    const resolvedValue = resolveElementValue(element, input);
    const resolvedValueResult = plugin.valueSchema.safeParse(resolvedValue);
    if (!resolvedValueResult.success) {
      for (const issue of resolvedValueResult.error.issues) {
        issues.push({
          severity: 'error',
          code: 'INVALID_RESOLVED_VALUE',
          message: issue.message,
          pageId: page.id,
          elementId: element.id,
          inputKey: element.binding?.key,
          path: ['value', ...issue.path].join('.'),
        });
      }
      continue;
    }

    let localNodeIndex = 0;
    const context: RenderBuildContext = {
      pageId: page.id,
      pageSize: page.size,
      input: resolvedInput,
      fontManager,
      format,
      createNodeId(localId) {
        const suffix = localId?.trim() || String(localNodeIndex++);
        return `${element.id}:node:${suffix}`;
      },
      report(issue) {
        issues.push(withLocation(issue, page.id, element.id));
      },
    };

    try {
      const builtNodes = plugin.buildRenderNodes({
        element,
        value: resolvedValueResult.data,
        context,
      });

      for (let nodeIndex = 0; nodeIndex < builtNodes.length; nodeIndex++) {
        const node = builtNodes[nodeIndex];
        const nodeIssues = validateBuiltNode(node, element, fileAssets);
        issues.push(...nodeIssues.map(issue => withLocation(issue, page.id, element.id)));
        if (nodeIds.has(node.id)) {
          issues.push({
            severity: 'error',
            code: 'DUPLICATE_RENDER_NODE_ID',
            message: `Duplicate render node id: ${node.id}`,
            pageId: page.id,
            elementId: element.id,
          });
          continue;
        }
        nodeIds.add(node.id);
        if (nodeIssues.some(issue => issue.severity === 'error')) continue;
        nodes.push({
          ...node,
          zIndex: elementIndex * 100 + nodeIndex,
        });
      }
    } catch (error) {
      issues.push({
        severity: 'error',
        code: 'PLUGIN_BUILD_FAILED',
        message: error instanceof Error ? error.message : String(error),
        pageId: page.id,
        elementId: element.id,
      });
    }
  }

  return {
    id: page.id,
    sourcePageId: page.id,
    continuationIndex: 0,
    size: { ...page.size },
    padding: [...page.padding],
    background: { ...page.background },
    nodes,
  };
}

export function resolveRenderTree(args: ResolveRenderTreeArgs): RenderDocument {
  const structuralResult = TemplateFileSchema.safeParse(args.file);
  const validationIssues = validateTemplateFile(args.file);
  const fallbackFormat = resolveFormatLocaleSettings(
    args.file && typeof args.file === 'object' && 'template' in args.file
      ? (args.file as TemplateFile).template?.metadata?.language
      : undefined,
    args.format,
  );
  if (!structuralResult.success) {
    return {
      templateId: 'invalid',
      format: fallbackFormat,
      pages: [],
      issues: validationIssues,
    };
  }

  const file = structuralResult.data;
  const format = resolveFormatLocaleSettings(file.template.metadata?.language, args.format);
  const issues: RenderIssue[] = [...validationIssues];
  const pages = file.template.pages.map(page => resolvePage(
    page,
    file.assets,
    args.input,
    args.plugins,
    args.fontManager,
    format,
    issues,
  ));

  const referenceInput: InputRecord = { ...args.input };
  for (const page of file.template.pages) {
    for (const element of page.elements) {
      if (
        element.binding
        && !Object.prototype.hasOwnProperty.call(referenceInput, element.binding.key)
        && element.value !== undefined
      ) {
        referenceInput[element.binding.key] = element.value;
      }
    }
  }

  const logical = {
    templateId: file.template.id,
    format,
    pages,
    issues,
  };
  return resolveFormulaFields(
    resolveOutputBindings(computeProducerNodes(logical)),
    referenceInput,
  );
}
