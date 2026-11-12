import type { TemplateElement } from '@/engine/core/document.js';
import { getPropertyValueState } from '@/editor/state/propertyPanelModel.js';
import { t, type MessageKey } from '@/i18n/index.js';
import InspectorUnitInput from './InspectorUnitInput.js';

interface GeometryFieldDefinition {
  path: string;
  badge: string;
  labelKey: MessageKey;
  min?: number;
  max?: number;
  unit: 'mm' | '°';
}

const GEOMETRY_FIELDS: GeometryFieldDefinition[] = [
  { path: 'box.x', badge: 'X', labelKey: 'property.base.x', unit: 'mm' },
  { path: 'box.y', badge: 'Y', labelKey: 'property.base.y', unit: 'mm' },
  { path: 'box.width', badge: 'W', labelKey: 'property.base.width', min: 1, unit: 'mm' },
  { path: 'box.height', badge: 'H', labelKey: 'property.base.height', min: 1, unit: 'mm' },
  { path: 'rotate', badge: '↻', labelKey: 'property.base.rotate', min: -180, max: 180, unit: '°' },
];

export default function GeometryBar({
  elements,
  disabled,
  onChange,
  onEndHistoryGroup,
  onCancelHistoryGroup,
}: {
  elements: TemplateElement<object>[];
  disabled: boolean;
  onChange(path: string, value: number, historyGroup: string): void;
  onEndHistoryGroup(group: string): void;
  onCancelHistoryGroup(group: string): void;
}) {
  const selectionKey = elements.map(element => element.id).join(':');
  return (
    <section className="layoutpdf-inspector-transform" aria-label={t('property.panel.geometryAria')}>
      <div className="layoutpdf-inspector-section-heading">
        <strong>{t('property.panel.geometryAria')}</strong>
      </div>
      <div className="layoutpdf-geometry-bar" role="group">
        {GEOMETRY_FIELDS.map(field => {
          const state = getPropertyValueState(elements, field.path);
          const historyGroup = `property:${selectionKey}:${field.path}`;
          return (
            <InspectorUnitInput
              key={field.path}
              label={t(field.labelKey)}
              prefix={field.badge}
              unit={field.unit}
              resetKey={selectionKey}
              historyGroup={historyGroup}
              min={field.min}
              max={field.max}
              value={!state.mixed && typeof state.value === 'number' ? state.value : null}
              mixed={state.mixed}
              disabled={disabled}
              onChange={value => onChange(field.path, value, historyGroup)}
              onEndHistoryGroup={onEndHistoryGroup}
              onCancelHistoryGroup={onCancelHistoryGroup}
            />
          );
        })}
      </div>
    </section>
  );
}
