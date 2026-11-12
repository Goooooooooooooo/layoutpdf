import { useMemo, type Dispatch, type PointerEvent as ReactPointerEvent } from 'react';
import type { JsonValue, TemplateElement } from '@/engine/core/document.js';
import type { PropertyDefinition } from '@/engine/core/plugin.js';
import type { PluginRegistry } from '@/engine/core/plugin.js';
import { pluginRegistry as defaultPluginRegistry } from '@/plugins/index.js';
import type { CurrencyProps } from '@/plugins/currency/currency.js';
import type { DocumentAction, DocumentState } from '@/editor/state/documentState.js';
import {
  alignElementBoxes,
  type Alignment,
} from '@/editor/layout/selectionGeometry.js';
import {
  getElementPath,
  getPropertyDefaultValue,
  getPropertyValueState,
  isPropertyAtDefault,
  PROPERTY_GROUP_LABEL_KEYS,
  resolvePropertyGroup,
  VISIBLE_PROPERTY_GROUPS,
} from '@/editor/state/propertyPanelModel.js';
import {
  buildBindingFieldIndex,
  getBindingConflict,
  getCompatibleBindingKeys,
} from '@/editor/state/bindingFieldIndex.js';
import {
  PropertyField as Field,
  PropertyGroup,
} from '@/editor/components/propertyPanel/PropertyField.js';
import GeometryBar from '@/editor/components/propertyPanel/GeometryBar.js';
import InspectorColorField from '@/editor/components/propertyPanel/InspectorColorField.js';
import { ComplexPropertyEditor } from '@/editor/components/propertyPanel/propertyEditorRegistry.js';
import { useDesignerPropertyEditor } from '@/editor/components/propertyPanel/propertyEditorContext.js';
import { isStandardPropertyDefinition } from '@/editor/components/propertyPanel/propertyEditorRouting.js';
import IconButton from '@/ui/button/IconButton.js';
import Icon, { type IconName } from '@/ui/icon/Icon.js';
import { NumberInput, TextInput } from '@/ui/input/Input.js';
import MenuButton from '@/ui/menuButton/MenuButton.js';
import { resolveMessageLabel, t } from '@/i18n/index.js';
import {
  buildElementCommandDescriptors,
  commandItems,
} from '@/editor/commands/elementCommands.js';

const BINDING_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*$/;

function validateBindingKey(key: string, allElements: readonly TemplateElement<object>[], selfId: string): string | undefined {
  const trimmed = key.trim();
  if (!trimmed) return t('property.binding.emptyKey');
  if (!BINDING_KEY_PATTERN.test(trimmed)) return t('property.binding.invalidKeyFormat');
  const duplicate = allElements.some(
    el => el.id !== selfId && el.binding?.key.trim() === trimmed,
  );
  if (duplicate) return t('property.binding.duplicateKey', { key: trimmed });
  return undefined;
}

interface ElementPropertyPanelProps {
  state: DocumentState;
  dispatch: Dispatch<DocumentAction>;
  plugins?: PluginRegistry;
  width?: number;
  onWidthChange?(width: number): void;
  onCollapse?: () => void;
}

const ALIGNMENT_ICONS: Record<Alignment, IconName> = {
  left: 'align-left',
  right: 'align-right',
  top: 'align-top',
  bottom: 'align-bottom',
  horizontalCenter: 'align-center-horizontal',
  verticalCenter: 'align-center-vertical',
};

export default function ElementPropertyPanel({ state, dispatch, plugins = defaultPluginRegistry, width, onWidthChange, onCollapse }: ElementPropertyPanelProps) {
  const ids = state.selectedElementIds;
  const allElements = useMemo(
    () => state.templateFile.template.pages.flatMap(page => page.elements),
    [state.templateFile.template.pages],
  );
  const elementsById = useMemo(() => new Map(allElements.map(item => [item.id, item])), [allElements]);
  const selectedElements = useMemo(
    () => ids.flatMap(id => { const selected = elementsById.get(id); return selected ? [selected] : []; }),
    [ids, elementsById],
  );
  const panelStyle = width !== undefined ? { width } : undefined;
  const handleResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onWidthChange || width === undefined) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const onMove = (moveEvent: PointerEvent) => {
      onWidthChange(startWidth + (startX - moveEvent.clientX));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const resizeHandle = onWidthChange ? (
    <div
      className="layoutpdf-properties-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('property.panel.resizeAria')}
      onPointerDown={handleResizeStart}
    />
  ) : null;
  const element = selectedElements[0];
  const propertyEditorOverride = useDesignerPropertyEditor(element?.type);
  if (!element) {
    const page = state.templateFile.template.pages.find(item => item.id === state.activePageId)
      ?? state.templateFile.template.pages[0];
    const updatePadding = (index: number, value: number) => {
      const padding = [...page.padding] as typeof page.padding;
      padding[index] = value;
      dispatch({ type: 'page/updatePadding', pageId: page.id, padding });
    };
    const labels = [
      t('property.panel.paddingTop'),
      t('property.panel.paddingRight'),
      t('property.panel.paddingBottom'),
      t('property.panel.paddingLeft'),
    ];
    return (
      <aside className="layoutpdf-properties" style={panelStyle}>
        {resizeHandle}
        <div className="layoutpdf-panel-title layoutpdf-property-header">
          <span className="layoutpdf-property-type-icon" aria-hidden="true">
            <Icon name="template" size={15} />
          </span>
          <div className="layoutpdf-property-identity">
            <strong>{t('property.panel.pageNumber', {
              index: state.templateFile.template.pages.findIndex(item => item.id === page.id) + 1,
            })}</strong>
            <span>{t('property.panel.pageSettings')}</span>
          </div>
          <div className="layoutpdf-property-header-actions">
            <IconButton
              tooltip={t('property.panel.collapse')}
              onClick={onCollapse}
            >
              <Icon name="chevron-right" />
            </IconButton>
          </div>
        </div>
        <div className="layoutpdf-property-scroll">
          <PropertyGroup label={t('property.panel.pageBackground')} defaultOpen>
            <div className="layoutpdf-property-field">
              <label htmlFor="page-background-color">{t('property.panel.pageBackgroundColor')}</label>
              <InspectorColorField
                id="page-background-color"
                value={page.background.kind === 'blank' ? page.background.color ?? null : null}
                mixed={false}
                disabled={page.background.kind !== 'blank'}
                onChange={color => dispatch({ type: 'page/updateBackground', pageId: page.id, color })}
              />
              <div className="layoutpdf-property-actions">
                <IconButton
                  size="sm"
                  title={t('property.panel.clearProperty', { label: t('property.panel.pageBackgroundColor') })}
                  aria-label={t('property.panel.clearProperty', { label: t('property.panel.pageBackgroundColor') })}
                  disabled={page.background.kind !== 'blank' || !page.background.color}
                  onClick={() => dispatch({ type: 'page/updateBackground', pageId: page.id, color: null })}
                >
                  <Icon name="x" size={14} />
                </IconButton>
              </div>
            </div>
            <p className="layoutpdf-panel-note">
              {t(page.background.kind === 'pdf'
                ? 'property.panel.pageBackgroundPdfNote'
                : 'property.panel.pageBackgroundNote')}
            </p>
          </PropertyGroup>
          <PropertyGroup label={t('property.panel.safePadding')} count={4} defaultOpen>
            <div className="layoutpdf-property-grid">
              {page.padding.map((value, index) => {
                const id = `page-padding-${index}`;
                return (
                  <div className="layoutpdf-property-field" key={labels[index]}>
                    <label htmlFor={id}>{labels[index]}</label>
                    <NumberInput
                      id={id}
                      min={0}
                      step={1}
                      value={value}
                      onValueChange={next => {
                        if (next !== null) updatePadding(index, next);
                      }}
                    />
                    <div className="layoutpdf-property-actions" />
                  </div>
                );
              })}
            </div>
            <p className="layoutpdf-panel-note">{t('property.panel.pagePaddingNote')}</p>
          </PropertyGroup>
        </div>
      </aside>
    );
  }
  const plugin = plugins.get(element.type);
  if (!plugin) {
    return (
      <aside className="layoutpdf-properties">
        <div className="layoutpdf-empty-panel">{t('property.panel.unknownPlugin')}</div>
      </aside>
    );
  }
  const patch = (path: string, value: JsonValue, historyGroup?: string) => dispatch({
    type: 'element/update',
    ids,
    patch: { path, value },
    historyGroup,
  });
  const propertyHistoryGroup = (path: string) => `property:${ids.join(',')}:${path}`;
  const endHistoryGroup = (group: string) => dispatch({ type: 'history/endGroup', group });
  const cancelHistoryGroup = (group: string) => dispatch({ type: 'history/cancelGroup', group });
  const baseFields: PropertyDefinition[] = [
    { path: 'opacity', label: '透明度', labelKey: 'property.base.opacity', editor: 'number', min: 0, max: 1, step: 0.1, group: 'style' },
    { path: 'locked', label: '锁定', labelKey: 'property.base.locked', editor: 'switch', group: 'advanced' },
    { path: 'hidden', label: '隐藏', labelKey: 'property.base.hidden', editor: 'switch', group: 'advanced' },
  ];
  const isSameType = selectedElements.every(item => item.type === element.type);
  const defaultElement = isSameType
    ? plugin.createDefaultElement({ id: 'property_default', position: { x: 0, y: 0 } }) as TemplateElement<object>
    : undefined;
  const hasLockedElements = selectedElements.some(item => item.locked);
  const pluginDefinitions = isSameType ? plugin.properties.filter(item =>
    isStandardPropertyDefinition(element.type, item, propertyEditorOverride?.ownedPaths)
    && !(element.type === 'currency'
      && item.path === 'props.source.key'
      && (element.props as CurrencyProps).source?.kind !== 'field')
    && !(element.type === 'currency'
      && item.path.startsWith('binding.')
      && (element.props as CurrencyProps).source?.kind === 'field')
  ) : [];
  const definitions = [...baseFields, ...pluginDefinitions];
  const bindingFields = buildBindingFieldIndex(state.templateFile, plugins);
  const bindingKind = isSameType ? plugin.metadata.bindingValueKind : undefined;
  const compatibleBindingKeys = getCompatibleBindingKeys(bindingFields, bindingKind);
  const ignoredElementIds = new Set(selectedElements.map(item => item.id));
  const resettableBasePaths = new Set([
    'opacity',
    'locked',
    'hidden',
  ]);
  const renderField = (definition: PropertyDefinition) => {
    const defaultValue = getPropertyDefaultValue(defaultElement, definition.path);
    const rawValueState = getPropertyValueState(selectedElements, definition.path);
    const usesTableStyleFallback = element.type === 'table'
      && (definition.path === 'props.style.cellPadding'
        || definition.path === 'props.style.headerBold')
      && defaultValue !== undefined;
    const effectiveValues = usesTableStyleFallback
      ? selectedElements.map(item => getElementPath(item, definition.path) ?? defaultValue)
      : [];
    const valueState = usesTableStyleFallback
      ? {
          value: effectiveValues[0],
          mixed: effectiveValues.slice(1).some(value => !Object.is(value, effectiveValues[0])),
        }
      : rawValueState;
    const isBaseField = baseFields.some(item => item.path === definition.path);
    const canResetPath = isBaseField
      ? resettableBasePaths.has(definition.path)
      : definition.path !== 'binding.key';
    const isAtDefault = usesTableStyleFallback
      ? !valueState.mixed && Object.is(valueState.value, defaultValue)
      : defaultValue !== undefined
        && isPropertyAtDefault(selectedElements, definition.path, defaultValue);
    const canReset = canResetPath
      && defaultValue !== undefined
      && !isAtDefault;
    const disabled = hasLockedElements && definition.path !== 'locked';
    const bindingConflict = definition.path === 'binding.key' && typeof valueState.value === 'string'
      ? getBindingConflict(bindingFields, valueState.value, bindingKind, ignoredElementIds)
      : undefined;
    const bindingIssue = definition.path === 'binding.key' && typeof valueState.value === 'string'
      ? (bindingConflict
        ? t('property.binding.conflict', {
            key: bindingConflict.key,
            types: bindingConflict.kinds.join(', '),
          })
        : validateBindingKey(valueState.value, allElements, element.id))
      : undefined;
    return (
      <Field
        key={definition.path}
        definition={definition}
        value={valueState.value}
        mixed={valueState.mixed}
        disabled={disabled}
        suggestions={definition.path === 'props.source.key' ? compatibleBindingKeys : undefined}
        issue={bindingIssue}
        historyGroup={propertyHistoryGroup(definition.path)}
        onChange={(value, historyGroup) => patch(definition.path, value, historyGroup)}
        onReset={defaultValue !== undefined
          ? historyGroup => patch(definition.path, defaultValue, historyGroup)
          : undefined}
        onEndHistoryGroup={endHistoryGroup}
        onCancelHistoryGroup={cancelHistoryGroup}
        resetDisabled={!canReset}
      />
    );
  };
  const sizeReference = selectedElements.at(-1);
  const pluginLabel = resolveMessageLabel(plugin.metadata);
  const selectedPage = state.templateFile.template.pages.find(page =>
    page.elements.some(candidate => candidate.id === element.id)
  );
  const menuItems = commandItems(buildElementCommandDescriptors({
    page: selectedPage,
    selectedIds: ids,
    dispatch,
  }), [
    'duplicate',
    'group',
    'ungroup',
    'divider-arrange',
    'bring-forward',
    'send-backward',
    'divider-state',
    'lock',
    'hide',
    'delete',
  ]);
  const nameHistoryGroup = propertyHistoryGroup('name');

  return (
    <aside className="layoutpdf-properties" style={panelStyle}>
      {resizeHandle}
      <div className="layoutpdf-panel-title layoutpdf-property-header">
        <span className="layoutpdf-property-type-icon" aria-hidden="true">
          {selectedElements.length > 1 ? selectedElements.length : pluginLabel.slice(0, 1)}
        </span>
        <div className="layoutpdf-property-identity">
          {selectedElements.length > 1 ? (
            <strong>{t('property.panel.selectedCount', { count: selectedElements.length })}</strong>
          ) : (
            <TextInput
              className="layoutpdf-element-name-input"
              aria-label={t('property.base.name')}
              value={element.name}
              disabled={hasLockedElements}
              onValueChange={name => patch('name', name, nameHistoryGroup)}
              onBlur={() => endHistoryGroup(nameHistoryGroup)}
              onKeyDown={event => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                cancelHistoryGroup(nameHistoryGroup);
                event.currentTarget.blur();
              }}
            />
          )}
          <span>{isSameType ? pluginLabel : t('property.panel.mixedTypes')}</span>
        </div>
        <div className="layoutpdf-property-header-actions">
          <MenuButton
            items={menuItems}
            label={t('property.panel.moreActions')}
          />
          <IconButton
            tooltip={t('property.panel.collapse')}
            onClick={onCollapse}
          >
            <Icon name="chevron-right" />
          </IconButton>
        </div>
      </div>
      {selectedElements.length > 1 ? (
        <div className="layoutpdf-inspector-icon-group" aria-label={t('property.panel.alignSelection')}>
        {([
          ['left', t('property.panel.alignLeft')],
          ['right', t('property.panel.alignRight')],
          ['top', t('property.panel.alignTop')],
          ['bottom', t('property.panel.alignBottom')],
          ['horizontalCenter', t('property.panel.alignHorizontalCenter')],
          ['verticalCenter', t('property.panel.alignVerticalCenter')],
        ] as Array<[Alignment, string]>).map(([alignment, label]) => (
          <IconButton
            key={alignment}
            size="sm"
            tooltip={label}
            tooltipSide="left"
            disabled={selectedElements.filter(item => !item.locked).length < 2}
            onClick={() => dispatch({
              type: 'element/updateBoxes',
              boxes: alignElementBoxes(selectedElements.filter(item => !item.locked), alignment),
            })}
          >
            <Icon name={ALIGNMENT_ICONS[alignment]} size={14} />
          </IconButton>
        ))}
      </div>
      ) : null}
      <GeometryBar
        elements={selectedElements}
        disabled={hasLockedElements}
        onChange={(path, value, historyGroup) => patch(path, value, historyGroup)}
        onEndHistoryGroup={endHistoryGroup}
        onCancelHistoryGroup={cancelHistoryGroup}
      />
      <div className="layoutpdf-property-scroll">
        {selectedElements.length > 1 && sizeReference ? (
          <p className="layoutpdf-selection-note">
            {t('property.panel.sizeReference', { name: sizeReference.name })}
          </p>
        ) : null}
        {VISIBLE_PROPERTY_GROUPS.map(group => {
          const groupDefinitions = definitions.filter(item => resolvePropertyGroup(item.group) === group);
          if (groupDefinitions.length === 0) return null;
          return (
            <PropertyGroup
              key={group}
              label={t(PROPERTY_GROUP_LABEL_KEYS[group])}
              count={groupDefinitions.length}
              defaultOpen={group === 'content' || group === 'data' || group === 'style'}
            >
              <div className="layoutpdf-property-grid">{groupDefinitions.map(renderField)}</div>
            </PropertyGroup>
          );
        })}
        {isSameType ? (
          <ComplexPropertyEditor
            state={state}
            dispatch={dispatch}
            element={element}
            disabled={hasLockedElements}
            patch={patch}
          />
        ) : null}
      </div>
    </aside>
  );
}
