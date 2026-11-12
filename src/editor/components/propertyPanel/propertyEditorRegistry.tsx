import { useMemo, useState, type ComponentType, type Dispatch } from 'react';
import type { JsonValue, TemplateElement } from '@/engine/core/document.js';
import type { TableValueRow } from '@/engine/renderTree/model.js';
import type { DocumentAction, DocumentState, ElementPatch } from '@/editor/state/documentState.js';
import { useDesignerPropertyEditor } from '@/editor/components/propertyPanel/propertyEditorContext.js';
import { PropertyGroup } from '@/editor/components/propertyPanel/PropertyField.js';
import CalcFormulaEditor from '@/editor/components/propertyPanel/CalcFormulaEditor.js';
import GridPropertySummary from '@/editor/components/propertyPanel/grid/GridPropertySummary.js';
import ImageAssetField from '@/editor/components/propertyPanel/image/ImageAssetField.js';
import SummaryBlockEditor from '@/editor/components/propertyPanel/summary/SummaryBlockEditor.js';
import TableInspectorEditor from '@/editor/components/propertyPanel/table/TableInspectorEditor.js';
import ChoiceOptionsEditor from '@/editor/components/propertyPanel/choice/ChoiceOptionsEditor.js';
import type { ChoiceOption } from '@/plugins/choiceShared.js';
import type { RadioGroupProps } from '@/plugins/radioGroup/radioGroup.js';
import type { SelectProps } from '@/plugins/select/select.js';
import type { GridProps } from '@/plugins/grid/grid.js';
import type { ImageProps, ImageValue } from '@/plugins/image/image.js';
import type { SummaryBlockProps } from '@/plugins/summary/summary.js';
import type { TableProps } from '@/plugins/table/table.js';
import Button from '@/ui/button/Button.js';
import { Dialog } from '@/ui/dialog/Dialog.js';
import { CheckboxInput, NumberInput, TextInput } from '@/ui/input/Input.js';
import Select from '@/ui/select/Select.js';
import { t } from '@/i18n/index.js';
import type { FormulaReferenceOption } from '@/editor/components/propertyPanel/FormulaExpressionInput.js';
import { TablePropsSchema } from '@/plugins/table/table.js';
import { createFormulaOutputReference } from '@/utils/calc.js';
import {
  buildPaginationGroupOptions,
  findMatchingPaginationGroup,
  mergeTablePagination,
  normalizeTablePaginationNumber,
  TABLE_PAGINATION_LIMITS,
  type PaginationGroupOption,
  type TablePaginationPatch,
} from '@/editor/components/propertyPanel/table/tablePaginationOptions.js';

function toJson(value: object | unknown[]): JsonValue {
  return value as JsonValue;
}

export interface ComplexPropertyEditorProps {
  state: DocumentState;
  dispatch: Dispatch<DocumentAction>;
  element: TemplateElement<object>;
  disabled: boolean;
  patch(path: string, value: JsonValue): void;
}

interface PropertyEditorAdapter {
  Component: ComponentType<ComplexPropertyEditorProps>;
}

function CalcPropertyEditor({ element, state, disabled, patch }: ComplexPropertyEditorProps) {
  return (
    <PropertyGroup label={t('property.calc.formula')} defaultOpen>
      <CalcFormulaEditor
        element={element}
        state={state}
        disabled={disabled}
        onChange={value => patch('value', value)}
      />
    </PropertyGroup>
  );
}

function ImagePropertyEditor({ element, state, disabled, patch }: ComplexPropertyEditorProps) {
  return (
    <PropertyGroup label={t('property.panel.imageResource')} defaultOpen>
      <ImageAssetField
        value={element.value as ImageValue}
        fit={(element.props as ImageProps).fit}
        assets={state.templateFile.assets}
        disabled={disabled}
        onValueChange={value => patch('value', value)}
        onFitChange={fit => patch('props.fit', fit)}
      />
    </PropertyGroup>
  );
}

function GridPropertyEditor({ element }: ComplexPropertyEditorProps) {
  const props = element.props as GridProps;
  return (
    <PropertyGroup label={t('property.grid.settings')} defaultOpen>
      <GridPropertySummary
        elementId={element.id}
        props={props}
      />
    </PropertyGroup>
  );
}

function tableFormulaReferences(
  state: DocumentState,
  currentElementId: string,
): FormulaReferenceOption[] {
  const references = new Map<string, FormulaReferenceOption>();
  const add = (key: string, label: string) => {
    const normalized = key.trim();
    if (!normalized) return;
    references.set(normalized, { token: `field.${normalized}`, label });
  };
  const record = state.inputs.records[state.inputs.activeRecordIndex] ?? {};
  for (const [key, value] of Object.entries(record)) {
    if (
      typeof value === 'number'
      || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
    ) {
      add(key, key);
    }
  }
  for (const candidate of state.templateFile.template.pages.flatMap(page => page.elements)) {
    if (
      candidate.binding?.key
      && ['number', 'currency'].includes(candidate.type)
    ) {
      add(candidate.binding.key, candidate.name);
    }
    if (candidate.id === currentElementId || candidate.type !== 'table') continue;
    const result = TablePropsSchema.safeParse(candidate.props);
    if (!result.success) continue;
    for (const footer of result.data.footers) {
      const token = createFormulaOutputReference(candidate.id, footer.id);
      references.set(token, { token, label: `${candidate.name} · ${footer.label}` });
    }
  }
  return [...references.values()];
}

function TablePropertyEditor({ element, state, dispatch, disabled, patch }: ComplexPropertyEditorProps) {
  const [isCreateSummaryOpen, setIsCreateSummaryOpen] = useState(false);
  const [hideInlineFooter, setHideInlineFooter] = useState(true);
  const props = element.props as TableProps;
  const defaultRows = Array.isArray(element.value) ? element.value as TableValueRow[] : [];
  const pagination = props.pagination;
  const effectivePagination = mergeTablePagination(pagination, {});
  const pageGroups = useMemo(() => {
    const page = state.templateFile.template.pages.find(candidate =>
      candidate.elements.some(item => item.id === element.id)
    );
    return buildPaginationGroupOptions(page, element.id);
  }, [state.templateFile.template.pages, element.id]);
  const updatePagination = (next: TablePaginationPatch) => {
    patch('props.pagination', toJson(mergeTablePagination(pagination, next)));
  };
  const finalElementIds = effectivePagination.finalElementIds;
  const repeatElementIds = effectivePagination.repeatElementIds;
  const finalGroup = findMatchingPaginationGroup(pageGroups, finalElementIds);
  const repeatGroup = findMatchingPaginationGroup(pageGroups, repeatElementIds);
  const repeatSet = new Set(repeatElementIds);
  const finalSet = new Set(finalElementIds);
  const availableFinalGroups = pageGroups.filter(group =>
    group.groupId === finalGroup?.groupId
    || group.elementIds.every(elementId => !repeatSet.has(elementId))
  );
  const availableRepeatGroups = pageGroups.filter(group =>
    group.groupId === repeatGroup?.groupId
    || group.elementIds.every(elementId => !finalSet.has(elementId))
  );
  const detachedFinalValue = finalElementIds.length > 0 && !finalGroup ? '__linked-final-elements__' : '';
  const detachedRepeatValue = repeatElementIds.length > 0 && !repeatGroup ? '__linked-repeat-elements__' : '';
  const groupLabel = (group: PaginationGroupOption) => t('property.table.paginationGroupOption', {
    names: group.memberNames.join(' / '),
    count: group.elementIds.length,
  });
  return (
    <>
      <PropertyGroup label={t('property.table.paginationSection')} defaultOpen>
        <div className="layoutpdf-property-grid">
          <div className="layoutpdf-property-field">
            <label htmlFor={`pagination-follow-group-${element.id}`}>{t('property.table.followGroup')}</label>
            <Select
              id={`pagination-follow-group-${element.id}`}
              value={finalGroup?.groupId ?? detachedFinalValue}
              disabled={disabled}
              options={[
                { value: '', label: t('property.table.followGroupNone') },
                ...(detachedFinalValue ? [{
                  value: detachedFinalValue,
                  label: t('property.table.linkedElements', { count: finalElementIds.length }),
                }] : []),
                ...availableFinalGroups.map(group => ({
                  value: group.groupId,
                  label: groupLabel(group),
                })),
              ]}
              onChange={value => {
                if (value === detachedFinalValue && detachedFinalValue) return;
                const group = pageGroups.find(candidate => candidate.groupId === value);
                updatePagination({ finalElementIds: group?.elementIds ?? [] });
              }}
            />
            <div className="layoutpdf-property-actions" />
          </div>
          <div className="layoutpdf-property-field">
            <label htmlFor={`pagination-repeat-group-${element.id}`}>{t('property.table.repeatGroup')}</label>
            <Select
              id={`pagination-repeat-group-${element.id}`}
              value={repeatGroup?.groupId ?? detachedRepeatValue}
              disabled={disabled}
              options={[
                { value: '', label: t('property.table.followGroupNone') },
                ...(detachedRepeatValue ? [{
                  value: detachedRepeatValue,
                  label: t('property.table.linkedElements', { count: repeatElementIds.length }),
                }] : []),
                ...availableRepeatGroups.map(group => ({
                  value: group.groupId,
                  label: groupLabel(group),
                })),
              ]}
              onChange={value => {
                if (value === detachedRepeatValue && detachedRepeatValue) return;
                const group = pageGroups.find(candidate => candidate.groupId === value);
                updatePagination({ repeatElementIds: group?.elementIds ?? [] });
              }}
            />
            <div className="layoutpdf-property-actions" />
          </div>
          <div className="layoutpdf-property-field">
            <label htmlFor={`pagination-row-mode-${element.id}`}>{t('property.table.rowMode')}</label>
            <Select
              id={`pagination-row-mode-${element.id}`}
              value={effectivePagination.rowMode}
              disabled={disabled}
              options={[
                { value: 'compact', label: t('property.table.rowModeCompact') },
                { value: 'preserve', label: t('property.table.rowModePreserve') },
              ]}
              onChange={value => updatePagination({ rowMode: value as 'compact' | 'preserve' })}
            />
            <div className="layoutpdf-property-actions" />
          </div>
          <div className="layoutpdf-property-field">
            <label htmlFor={`pagination-continuation-title-${element.id}`}>
              {t('property.table.continuationTitle')}
            </label>
            <TextInput
              id={`pagination-continuation-title-${element.id}`}
              maxLength={200}
              value={effectivePagination.continuation?.title ?? ''}
              disabled={disabled}
              placeholder={t('property.table.continuationTitlePlaceholder')}
              onValueChange={value => updatePagination({
                continuation: {
                  ...effectivePagination.continuation,
                  title: value,
                  showFragmentIndex: value.trim()
                    ? effectivePagination.continuation?.showFragmentIndex ?? false
                    : false,
                },
              })}
            />
            <div className="layoutpdf-property-actions" />
          </div>
          <div className="layoutpdf-property-field layoutpdf-property-field--checkbox">
            <label htmlFor={`pagination-fragment-index-${element.id}`}>
              {t('property.table.showFragmentIndex')}
            </label>
            <CheckboxInput
              id={`pagination-fragment-index-${element.id}`}
              checked={effectivePagination.continuation?.showFragmentIndex ?? false}
              disabled={disabled || !effectivePagination.continuation?.title?.trim()}
              onCheckedChange={showFragmentIndex => updatePagination({
                continuation: {
                  ...effectivePagination.continuation,
                  showFragmentIndex,
                },
              })}
            />
            <div className="layoutpdf-property-actions" />
          </div>
          <div className="layoutpdf-property-field">
            <label htmlFor={`pagination-min-rows-${element.id}`}>{t('property.table.minRowsOnLastPage')}</label>
            <NumberInput
              id={`pagination-min-rows-${element.id}`}
              min={TABLE_PAGINATION_LIMITS.minRowsOnLastPage.min}
              max={TABLE_PAGINATION_LIMITS.minRowsOnLastPage.max}
              step={1}
              value={effectivePagination.minRowsOnLastPage}
              disabled={disabled}
              onValueChange={value => {
                if (value === null) return;
                const normalized = normalizeTablePaginationNumber('minRowsOnLastPage', value);
                if (normalized !== undefined) updatePagination({ minRowsOnLastPage: normalized });
              }}
            />
            <div className="layoutpdf-property-actions" />
          </div>
          <div className="layoutpdf-property-field">
            <label htmlFor={`pagination-gap-${element.id}`}>{t('property.table.gapAfterTable')}</label>
            <NumberInput
              id={`pagination-gap-${element.id}`}
              min={TABLE_PAGINATION_LIMITS.gapAfterTable.min}
              max={TABLE_PAGINATION_LIMITS.gapAfterTable.max}
              step={0.5}
              value={effectivePagination.gapAfterTable}
              disabled={disabled}
              onValueChange={value => {
                if (value === null) return;
                const normalized = normalizeTablePaginationNumber('gapAfterTable', value);
                if (normalized !== undefined) updatePagination({ gapAfterTable: normalized });
              }}
            />
            <div className="layoutpdf-property-actions" />
          </div>
        </div>
        <p className="layoutpdf-panel-note">{t('property.table.paginationNote')}</p>
      </PropertyGroup>
      <PropertyGroup label={t('property.panel.tableStructure')} defaultOpen>
        <p className="layoutpdf-panel-note">
          {t('property.table.structureSummary', {
            columns: props.columns.length,
            rows: defaultRows.length,
          })}
        </p>
        <TableInspectorEditor
          props={props}
          rows={defaultRows}
          externalReferences={tableFormulaReferences(state, element.id)}
          disabled={disabled}
          onPropsChange={next => patch('props', toJson(next))}
          onRowsChange={next => patch('value', toJson(next))}
        />
      </PropertyGroup>
      <PropertyGroup label={t('property.table.sectionSummary')} defaultOpen>
        <label className="layoutpdf-checkbox-row">
          <CheckboxInput
            checked={props.showInlineFooter !== false}
            disabled={disabled}
            onCheckedChange={showInlineFooter => patch('props.showInlineFooter', showInlineFooter)}
          />
          <span>{t('property.table.showInlineFooter')}</span>
        </label>
        <Button
          size="compact"
          disabled={disabled || props.footers.length === 0}
          onClick={() => {
            setHideInlineFooter(true);
            setIsCreateSummaryOpen(true);
          }}
        >
          {t('property.table.createSummary')}
        </Button>
      </PropertyGroup>
      <Dialog
        open={isCreateSummaryOpen}
        title={t('property.table.createSummary')}
        description={t('property.table.createSummaryDescription')}
        onClose={() => setIsCreateSummaryOpen(false)}
        actions={(
          <>
            <Button onClick={() => setIsCreateSummaryOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                dispatch({
                  type: 'summary/createFromTable',
                  tableId: element.id,
                  hideInlineFooter,
                });
                setIsCreateSummaryOpen(false);
              }}
            >
              {t('common.create')}
            </Button>
          </>
        )}
      >
        <label className="layoutpdf-checkbox-row">
          <CheckboxInput checked={hideInlineFooter} onCheckedChange={setHideInlineFooter} />
          <span>{t('property.table.hideInlineAfterCreate')}</span>
        </label>
      </Dialog>
    </>
  );
}

function SummaryPropertyEditor({ element, state, dispatch, disabled, patch }: ComplexPropertyEditorProps) {
  const page = state.templateFile.template.pages.find(candidate =>
    candidate.elements.some(item => item.id === element.id)
  );
  if (!page) return null;
  return (
    <PropertyGroup label={t('property.summary.settings')} defaultOpen>
      <SummaryBlockEditor
        page={page}
        summaryId={element.id}
        props={element.props as SummaryBlockProps}
        disabled={disabled}
        onChange={next => patch('props', toJson(next))}
        onToggleOutput={(sourceElementId, outputId, selected) => dispatch({
          type: 'summary/toggleOutput',
          summaryId: element.id,
          sourceElementId,
          outputId,
          selected,
        })}
        onSelectSource={sourceElementId => {
          dispatch({ type: 'page/activate', pageId: page.id });
          dispatch({ type: 'selection/set', ids: [sourceElementId] });
        }}
      />
    </PropertyGroup>
  );
}

function ChoicePropertyEditor({
  element,
  state,
  dispatch,
  disabled,
  patch,
}: ComplexPropertyEditorProps) {
  const props = element.props as SelectProps | RadioGroupProps;
  const value = typeof element.value === 'string' ? element.value : '';
  const updateOptions = (options: ChoiceOption[]) => {
    const currentIndex = props.options.findIndex(option => option.value === value);
    const hasCurrentValue = value === '' || options.some(option => option.value === value);
    const patches: ElementPatch[] = [{
      path: 'props.options',
      value: toJson(options),
    }];
    if (!hasCurrentValue) {
      patches.push({
        path: 'value',
        value: options[currentIndex]?.value ?? options[0]?.value ?? '',
      });
    }
    dispatch({
      type: 'element/updatePatches',
      ids: state.selectedElementIds,
      patches,
    });
  };

  return (
    <>
      <PropertyGroup label={t('property.choice.defaultValue')} defaultOpen>
        <Select
          value={value}
          aria-label={t('property.choice.defaultValue')}
          disabled={disabled}
          options={[
            { value: '', label: t('property.choice.noDefault') },
            ...props.options.map(option => ({
              value: option.value,
              label: `${option.label} (${option.value})`,
            })),
          ]}
          onChange={nextValue => patch('value', nextValue)}
        />
      </PropertyGroup>
      <PropertyGroup label={t('property.choice.options')} count={props.options.length} defaultOpen>
        <ChoiceOptionsEditor
          options={props.options as ChoiceOption[]}
          disabled={disabled}
          onChange={updateOptions}
        />
      </PropertyGroup>
    </>
  );
}

// Keep Plugin-specific UI knowledge at this editor boundary so the panel shell
// remains driven by PropertyDefinition and never needs to interpret private props.
const PROPERTY_EDITOR_ADAPTERS = new Map<string, PropertyEditorAdapter>([
  ['calc', { Component: CalcPropertyEditor }],
  ['image', { Component: ImagePropertyEditor }],
  // Grid intentionally keeps its existing editor until the separate wide-workspace
  // redesign is approved; registering it here still removes the shell type branch.
  ['grid', { Component: GridPropertyEditor }],
  ['table', { Component: TablePropertyEditor }],
  ['summary', { Component: SummaryPropertyEditor }],
  ['select', { Component: ChoicePropertyEditor }],
  ['radiogroup', { Component: ChoicePropertyEditor }],
]);

export function ComplexPropertyEditor(props: ComplexPropertyEditorProps) {
  const override = useDesignerPropertyEditor(props.element.type);
  if (override) {
    const Custom = override.component;
    return (
      <Custom
        element={props.element}
        disabled={props.disabled}
        templateFile={props.state.templateFile}
        patch={(path, value) => props.patch(path, value)}
        patchMany={patches => {
          if (patches.length === 0) return;
          const elementPatches: ElementPatch[] = patches.map(item => ({
            path: item.path,
            value: item.value,
          }));
          props.dispatch({
            type: 'element/updatePatches',
            ids: props.state.selectedElementIds,
            patches: elementPatches,
          });
        }}
      />
    );
  }
  const Component = PROPERTY_EDITOR_ADAPTERS.get(props.element.type)?.Component;
  return Component ? <Component {...props} /> : null;
}
