import type { MessageKey } from '@/i18n/messages.js';

export type IssueCategory =
  | 'input'
  | 'template'
  | 'layout'
  | 'resource'
  | 'formula'
  | 'import'
  | 'storage'
  | 'unknown';

export type IssueLayer = 'template' | 'field' | 'record' | 'layout' | 'export' | 'storage';

export type IssueTargetField = 'pageId' | 'elementId' | 'inputKey' | 'path';

export interface IssueRegistryEntry {
  messageKey?: MessageKey;
  category: IssueCategory;
  defaultLayer: IssueLayer;
  defaultSeverity: 'warning' | 'error';
  targetFields: readonly IssueTargetField[];
}

export interface IssueExplanation {
  causeKey: MessageKey;
  impactKey: MessageKey;
  nextStepKey: MessageKey;
}

const MESSAGE_KEY_BY_CODE: Readonly<Record<string, MessageKey>> = {
  ASSET_COUNT_EXCEEDS_LIMIT: 'error.assetCountExceedsLimit',
  ASSET_SIZE_EXCEEDS_LIMIT: 'error.assetSizeExceedsLimit',
  DUPLICATE_ELEMENT_ID: 'error.duplicateElementId',
  DUPLICATE_PAGE_ID: 'error.duplicatePageId',
  DUPLICATE_RENDER_NODE_ID: 'error.duplicateRenderNodeId',
  DUPLICATE_DERIVED_FIELD: 'error.duplicateDerivedField',
  DERIVED_FIELD_CONFLICT: 'error.derivedFieldConflict',
  ELEMENT_COUNT_EXCEEDS_LIMIT: 'error.elementCountExceedsLimit',
  ELEMENT_OUTSIDE_PAGE: 'error.elementOutsidePage',
  ELEMENT_OVERFLOW_PAGE: 'error.elementOverflowPage',
  EXCEL_CELL_TYPE_INVALID: 'error.excelCellTypeInvalid',
  EXCEL_FIELD_MAPPING_DUPLICATE: 'error.excelFieldMappingDuplicate',
  EXCEL_FIELD_MISSING: 'error.excelFieldMissing',
  EXCEL_FIELD_TYPE_MISMATCH: 'error.excelFieldTypeMismatch',
  EXCEL_FORMAT_INVALID: 'error.excelFormatInvalid',
  EXCEL_LIMIT_EXCEEDED: 'error.excelLimitExceeded',
  EXCEL_SHEET_MISSING: 'error.excelSheetMissing',
  EXCEL_TABLE_COLUMNS_MISMATCH: 'error.excelTableColumnsMismatch',
  EXCEL_TABLE_ROWS_EXCEED_TEMPLATE: 'error.excelTableRowsExceedTemplate',
  EXCEL_TEMPLATE_INVALID: 'error.excelTemplateInvalid',
  EXCEL_TEMPLATE_MISMATCH: 'error.excelTemplateMismatch',
  EXCEL_UNKNOWN_FIELD: 'error.excelUnknownField',
  EXCEL_VERSION_UNSUPPORTED: 'error.excelVersionUnsupported',
  GRID_CELL_COUNT_EXCEEDS_LIMIT: 'error.gridCellCountExceedsLimit',
  GRID_COLUMN_COUNT_EXCEEDS_LIMIT: 'error.gridColumnCountExceedsLimit',
  GRID_ROW_COUNT_EXCEEDS_LIMIT: 'error.gridRowCountExceedsLimit',
  GRID_CELL_OVERFLOW: 'error.gridCellOverflow',
  GRID_FORMULA_CYCLE: 'error.gridFormulaCycle',
  GRID_LAYOUT_FAILED: 'error.gridLayoutFailed',
  SUMMARY_BLOCK_UNCONFIGURED: 'error.summaryBlockUnconfigured',
  MISSING_ELEMENT_OUTPUT_SOURCE: 'error.missingElementOutputSource',
  MISSING_ELEMENT_OUTPUT: 'error.missingElementOutput',
  DUPLICATE_RENDER_OUTPUT: 'error.duplicateRenderOutput',
  UNSUPPORTED_ELEMENT_OUTPUT_VALUE: 'error.unsupportedElementOutputValue',
  SUMMARY_BLOCK_LAYOUT_FAILED: 'error.summaryBlockLayoutFailed',
  DUPLICATE_ELEMENT_OUTPUT_REFERENCE: 'error.duplicateElementOutputReference',
  INVALID_ELEMENT_OUTPUT_SOURCE: 'error.invalidElementOutputSource',
  INVALID_ELEMENT_OUTPUT_ID: 'error.invalidElementOutputId',
  IMPORT_FILE_EMPTY: 'error.importFileEmpty',
  IMPORT_FILE_SIZE_EXCEEDED: 'error.importFileSizeExceeded',
  INLINE_IMAGE_SIZE_EXCEEDS_LIMIT: 'error.inlineImageSizeExceedsLimit',
  INVALID_ASSET_DATA: 'error.invalidAssetData',
  INVALID_BACKGROUND_ASSET_TYPE: 'error.invalidBackgroundAssetType',
  INVALID_CHOICE_VALUE: 'error.invalidChoiceValue',
  INVALID_DOCUMENT_STRUCTURE: 'error.invalidDocumentStructure',
  INVALID_IMAGE_ASSET: 'error.invalidImageAsset',
  INVALID_IMAGE_DATA_URL: 'error.invalidImageDataUrl',
  INVALID_GRID_FORMULA: 'error.invalidGridFormula',
  INVALID_PLUGIN_NODE: 'error.invalidPluginNode',
  INVALID_PLUGIN_PROPS: 'error.invalidPluginProps',
  INVALID_PLUGIN_VALUE: 'error.invalidPluginValue',
  MISSING_PLUGIN_RENDERER: 'error.missingPluginRenderer',
  INVALID_RENDER_NODE_BOX: 'error.invalidRenderNodeBox',
  INVALID_RENDER_NODE_ID: 'error.invalidRenderNodeId',
  INVALID_RENDER_NODE_OPACITY: 'error.invalidRenderNodeOpacity',
  INVALID_RENDER_NODE_ROTATE: 'error.invalidRenderNodeRotate',
  INVALID_RENDER_NODE_SOURCE: 'error.invalidRenderNodeSource',
  INVALID_RESOLVED_VALUE: 'error.invalidResolvedValue',
  INVALID_REFERENCED_FIELD: 'error.invalidReferencedField',
  INVALID_TABLE_PAGINATION_METRICS: 'error.invalidTablePaginationMetrics',
  INVALID_TABLE_PAGINATION_REFERENCE: 'error.invalidTablePaginationReference',
  CONTINUATION_REPEAT_REGION_INVALID: 'error.continuationRepeatRegionInvalid',
  MISSING_BACKGROUND_ASSET: 'error.missingBackgroundAsset',
  MISSING_IMAGE_ASSET: 'error.missingImageAsset',
  MISSING_IMAGE_SOURCE: 'error.missingImageSource',
  MISSING_REQUIRED_INPUT: 'error.missingRequiredInput',
  MISSING_REFERENCED_FIELD: 'error.missingReferencedField',
  MULTIPLE_DYNAMIC_TABLES_ON_PAGE_UNSUPPORTED: 'error.multipleDynamicTablesUnsupported',
  NEW_TEMPLATE_ID_REQUIRED: 'error.newTemplateIdRequired',
  PAGE_COUNT_EXCEEDS_LIMIT: 'error.pageCountExceedsLimit',
  PAGE_PADDING_EXCEEDS_SIZE: 'error.pagePaddingExceedsSize',
  PLUGIN_BUILD_FAILED: 'error.pluginBuildFailed',
  QRCODE_ENCODING_FAILED: 'error.qrcodeEncodingFailed',
  BARCODE_ENCODING_FAILED: 'error.barcodeEncodingFailed',
  RUNNER_BATCH_EXPORT_LIMIT_EXCEEDED: 'error.runnerBatchExportLimitExceeded',
  RUNNER_BATCH_EXPORT_SIZE_EXCEEDED: 'error.runnerBatchExportSizeExceeded',
  RUNNER_BATCH_PREFLIGHT_FAILED: 'error.runnerBatchPreflightFailed',
  RUNNER_BATCH_RECORD_EXPORT_FAILED: 'error.runnerBatchRecordExportFailed',
  TABLE_PRESENTATION_FAILED: 'error.tablePresentationFailed',
  TABLE_FINAL_GROUP_TOO_TALL: 'error.tableFinalGroupTooTall',
  TABLE_FOOTER_TOO_TALL: 'error.tableFooterTooTall',
  TABLE_ROW_TOO_TALL: 'error.tableRowTooTall',
  TABLE_CONTINUATION_DECORATION_TOO_TALL: 'error.tableContinuationDecorationTooTall',
  TABLE_ROW_COUNT_EXCEEDS_LIMIT: 'error.tableRowCountExceedsLimit',
  TEMPLATE_ALREADY_EXISTS: 'error.templateAlreadyExists',
  TEMPLATE_NOT_FOUND: 'error.templateNotFound',
  TEXT_LAYOUT_FAILED: 'error.textLayoutFailed',
  TEXT_OVERFLOW: 'error.textOverflow',
  THUMBNAIL_CACHE_KEY_REQUIRED: 'error.thumbnailCacheKeyRequired',
  TOTAL_ASSET_SIZE_EXCEEDS_LIMIT: 'error.totalAssetSizeExceedsLimit',
  UNKNOWN_PLUGIN: 'error.unknownPlugin',
  UNKNOWN_VARIABLE: 'error.unknownVariable',
  UNCLOSED_BRACE: 'error.unclosedBrace',
  NESTED_BRACE: 'error.nestedBrace',
  EMPTY_PLACEHOLDER: 'error.emptyPlaceholder',
  INVALID_VARIABLE_NAME: 'error.invalidVariableName',
};

const RUNNER_CODES = [
  'RUNNER_BATCH_EXPORT_LIMIT_EXCEEDED',
  'RUNNER_BATCH_EXPORT_SIZE_EXCEEDED',
  'RUNNER_BATCH_PREFLIGHT_FAILED',
  'RUNNER_BATCH_RECORD_EXPORT_FAILED',
  'RUNNER_CHOICE_OPTIONS_CONFLICT',
  'RUNNER_FIELD_DEFAULT_CONFLICT',
  'RUNNER_FIELD_INPUT_KIND_CONFLICT',
  'RUNNER_FIELD_TYPE_CONFLICT',
  'RUNNER_INPUT_DEFINITION_FAILED',
  'RUNNER_INPUT_KEY_MISMATCH',
  'RUNNER_INPUT_KIND_MISMATCH',
  'RUNNER_INVALID_CHOICE',
  'RUNNER_INVALID_DATE',
  'RUNNER_INVALID_FIELD_TYPE',
  'RUNNER_INVALID_TABLE_CELL',
  'RUNNER_INVALID_TABLE_ROW',
  'RUNNER_TABLE_COLUMNS_CONFLICT',
] as const;

const ADDITIONAL_ENGINE_CODES = [
  'ELEMENT_GROUP_REQUIRES_MULTIPLE_MEMBERS',
  'ELEMENT_GROUP_SPANS_PAGES',
  'INVALID_FORMULA',
] as const;

const EXCEL_RECORD_CODES = [
  'EXCEL_COLUMN_MAPPING_REQUIRED',
  'EXCEL_DETAIL_RECORD_MISSING',
  'EXCEL_DETAIL_ROW_ID_DUPLICATE',
  'EXCEL_RECORD_ID_DUPLICATE',
  'EXCEL_RECORD_ID_MISSING',
] as const;

const VARIABLE_CODES = [
  'UNKNOWN_VARIABLE',
  'UNCLOSED_BRACE',
  'NESTED_BRACE',
  'EMPTY_PLACEHOLDER',
  'INVALID_VARIABLE_NAME',
  'DUPLICATE_VARIABLE_NAME',
  'VARIABLE_COUNT_EXCEEDS_LIMIT',
  'VARIABLE_VALUE_TOO_LONG',
] as const;

const STORAGE_CODES = new Set([
  'NEW_TEMPLATE_ID_REQUIRED',
  'TEMPLATE_ALREADY_EXISTS',
  'TEMPLATE_NOT_FOUND',
  'THUMBNAIL_CACHE_KEY_REQUIRED',
]);

const WARNING_CODES = new Set([
  'ELEMENT_OVERFLOW_PAGE',
  'EXCEL_FIELD_MISSING',
  'EXCEL_TABLE_ROWS_EXCEED_TEMPLATE',
  'EXCEL_UNKNOWN_FIELD',
  'GRID_CELL_OVERFLOW',
  'RUNNER_FIELD_DEFAULT_CONFLICT',
  'RUNNER_FIELD_INPUT_KIND_CONFLICT',
  'SUMMARY_BLOCK_UNCONFIGURED',
  'TEXT_OVERFLOW',
]);

const RESOURCE_CODE_PATTERN = /(ASSET|IMAGE|QRCODE|BARCODE)/;
const IMPORT_CODE_PATTERN = /^(EXCEL_|IMPORT_)/;
const FORMULA_CODE_PATTERN = /FORMULA/;
const LAYOUT_CODE_PATTERN = /^(ELEMENT_(OUTSIDE|OVERFLOW)|GRID_.*(?:OVERFLOW|LAYOUT)|INVALID_RENDER_NODE_|INVALID_TABLE_PAGINATION|CONTINUATION_|MULTIPLE_DYNAMIC_TABLES|PAGE_PADDING|SUMMARY_BLOCK_LAYOUT|TABLE_(?:PRESENTATION|FINAL_GROUP|FOOTER|ROW_TOO|CONTINUATION_DECORATION)|TEXT_(?:LAYOUT|OVERFLOW))/;

const VARIABLE_CODE_SET = new Set<string>(VARIABLE_CODES);

function categoryFor(code: string): IssueCategory {
  if (code === 'MISSING_REQUIRED_INPUT' || code === 'INVALID_CHOICE_VALUE' || code.startsWith('RUNNER_INVALID_')) {
    return 'input';
  }
  if (VARIABLE_CODE_SET.has(code)) return 'input';
  if (STORAGE_CODES.has(code)) return 'storage';
  if (IMPORT_CODE_PATTERN.test(code)) return 'import';
  if (FORMULA_CODE_PATTERN.test(code)) return 'formula';
  if (RESOURCE_CODE_PATTERN.test(code)) return 'resource';
  if (LAYOUT_CODE_PATTERN.test(code)) return 'layout';
  return 'template';
}

function layerFor(category: IssueCategory): IssueLayer {
  if (category === 'input') return 'field';
  if (category === 'storage') return 'storage';
  if (category === 'import') return 'record';
  if (category === 'layout' || category === 'formula' || category === 'resource') return 'layout';
  return 'template';
}

function targetFieldsFor(category: IssueCategory): readonly IssueTargetField[] {
  if (category === 'storage') return [];
  if (category === 'import') return ['inputKey', 'path'];
  if (category === 'input') return ['inputKey', 'path', 'pageId', 'elementId'];
  return ['pageId', 'elementId', 'inputKey', 'path'];
}

const registryEntries = [
  ...Object.keys(MESSAGE_KEY_BY_CODE),
  ...RUNNER_CODES,
  ...ADDITIONAL_ENGINE_CODES,
  ...EXCEL_RECORD_CODES,
  ...VARIABLE_CODES,
  'TABLE_FORMULA_EVALUATION_FAILED',
].map(code => {
  const category = categoryFor(code);
  return [code, {
    messageKey: MESSAGE_KEY_BY_CODE[code],
    category,
    defaultLayer: layerFor(category),
    defaultSeverity: WARNING_CODES.has(code) ? 'warning' : 'error',
    targetFields: targetFieldsFor(category),
  } satisfies IssueRegistryEntry] as const;
});

export const ISSUE_REGISTRY: Readonly<Record<string, IssueRegistryEntry>> = Object.freeze(
  Object.fromEntries(registryEntries),
);

export const REGISTERED_WORKSPACE_ISSUE_CODES = Object.freeze(Object.keys(ISSUE_REGISTRY).sort());

export function issueMessageKey(
  code: string,
  values: Readonly<Record<string, unknown>> = {},
): MessageKey | undefined {
  if (code === 'TABLE_FORMULA_EVALUATION_FAILED') {
    return values.formulaTarget === 'footer'
      ? 'error.tableFooterFormulaEvaluationFailed'
      : 'error.tableRowFormulaEvaluationFailed';
  }
  return ISSUE_REGISTRY[code]?.messageKey;
}

export function resolveIssueRegistryEntry(code: string): IssueRegistryEntry {
  return ISSUE_REGISTRY[code] ?? {
    category: 'unknown',
    defaultLayer: 'template',
    defaultSeverity: 'error',
    targetFields: ['pageId', 'elementId', 'inputKey', 'path'],
  };
}

const EXPLANATIONS: Readonly<Record<IssueCategory, IssueExplanation>> = {
  input: {
    causeKey: 'issueCenter.explanation.input.cause',
    impactKey: 'issueCenter.explanation.input.impact',
    nextStepKey: 'issueCenter.explanation.input.nextStep',
  },
  template: {
    causeKey: 'issueCenter.explanation.template.cause',
    impactKey: 'issueCenter.explanation.template.impact',
    nextStepKey: 'issueCenter.explanation.template.nextStep',
  },
  layout: {
    causeKey: 'issueCenter.explanation.layout.cause',
    impactKey: 'issueCenter.explanation.layout.impact',
    nextStepKey: 'issueCenter.explanation.layout.nextStep',
  },
  resource: {
    causeKey: 'issueCenter.explanation.resource.cause',
    impactKey: 'issueCenter.explanation.resource.impact',
    nextStepKey: 'issueCenter.explanation.resource.nextStep',
  },
  formula: {
    causeKey: 'issueCenter.explanation.formula.cause',
    impactKey: 'issueCenter.explanation.formula.impact',
    nextStepKey: 'issueCenter.explanation.formula.nextStep',
  },
  import: {
    causeKey: 'issueCenter.explanation.import.cause',
    impactKey: 'issueCenter.explanation.import.impact',
    nextStepKey: 'issueCenter.explanation.import.nextStep',
  },
  storage: {
    causeKey: 'issueCenter.explanation.storage.cause',
    impactKey: 'issueCenter.explanation.storage.impact',
    nextStepKey: 'issueCenter.explanation.storage.nextStep',
  },
  unknown: {
    causeKey: 'issueCenter.explanation.unknown.cause',
    impactKey: 'issueCenter.explanation.unknown.impact',
    nextStepKey: 'issueCenter.explanation.unknown.nextStep',
  },
};

export function explanationForIssue(code: string): IssueExplanation {
  return EXPLANATIONS[resolveIssueRegistryEntry(code).category];
}
