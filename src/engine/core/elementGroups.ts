import type {
  IdGenerator,
  LayoutPDFTemplate,
  TemplateElement,
  TemplatePage,
} from '@/engine/core/document.js';

export function elementGroupMembers(
  page: Pick<TemplatePage, 'elements'>,
  groupId: string,
): TemplateElement<object>[] {
  return page.elements.filter(element => element.groupId === groupId);
}

export function expandElementIdsToGroups(
  page: Pick<TemplatePage, 'elements'>,
  ids: readonly string[],
): string[] {
  const byId = new Map(page.elements.map(element => [element.id, element]));
  const expanded: string[] = [];
  for (const id of ids) {
    const element = byId.get(id);
    if (!element) continue;
    if (element.groupId) {
      expanded.push(...page.elements
        .filter(candidate => candidate.groupId === element.groupId)
        .map(candidate => candidate.id));
    } else {
      expanded.push(id);
    }
  }
  return [...new Set(expanded)];
}

export function expandTemplateElementIdsToGroups(
  template: LayoutPDFTemplate,
  ids: readonly string[],
): string[] {
  const expanded: string[] = [];
  for (const id of ids) {
    const page = template.pages.find(candidate =>
      candidate.elements.some(element => element.id === id)
    );
    if (page) expanded.push(...expandElementIdsToGroups(page, [id]));
  }
  return [...new Set(expanded)];
}

export function toggleElementGroupSelection(
  page: Pick<TemplatePage, 'elements'>,
  selectedIds: readonly string[],
  elementId: string,
): string[] {
  const targetIds = expandElementIdsToGroups(page, [elementId]);
  const selected = new Set(selectedIds);
  const remove = targetIds.every(id => selected.has(id));
  if (remove) {
    const target = new Set(targetIds);
    return selectedIds.filter(id => !target.has(id));
  }
  return [...selectedIds, ...targetIds.filter(id => !selected.has(id))];
}

export function normalizeElementGroups(page: Pick<TemplatePage, 'elements'>): void {
  const counts = new Map<string, number>();
  for (const element of page.elements) {
    if (element.groupId) counts.set(element.groupId, (counts.get(element.groupId) ?? 0) + 1);
  }
  for (const element of page.elements) {
    if (element.groupId && (counts.get(element.groupId) ?? 0) < 2) {
      delete element.groupId;
    }
  }
}

export function remapElementGroupIds(
  elements: TemplateElement<object>[],
  idGenerator: IdGenerator,
): void {
  const counts = new Map<string, number>();
  for (const element of elements) {
    if (element.groupId) counts.set(element.groupId, (counts.get(element.groupId) ?? 0) + 1);
  }
  const ids = new Map<string, string>();
  for (const element of elements) {
    const groupId = element.groupId;
    if (!groupId) continue;
    if ((counts.get(groupId) ?? 0) < 2) {
      delete element.groupId;
      continue;
    }
    let nextGroupId = ids.get(groupId);
    if (!nextGroupId) {
      nextGroupId = idGenerator('group');
      ids.set(groupId, nextGroupId);
    }
    element.groupId = nextGroupId;
  }
}
