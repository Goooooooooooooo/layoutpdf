import { createFormulaOutputReference } from '@/utils/calc.js';
import {
  cloneTemplateFileWithNewIds,
  remapFormulaOutputReferences,
  remapGridIdentities,
  remapTableIdentities,
} from '@/engine/core/cloneTemplateFile.js';
import {
  createBlankTemplateFile,
  createId,
  type CreateBlankTemplateOptions,
  type ElementBox,
  type IdGenerator,
  type LayoutPDFTemplate,
  type TemplateElement,
  type TemplateFile,
  type TemplateMetadata,
  type TemplatePage,
} from '@/engine/core/document.js';
import {
  duplicateElementsInPage,
  reconcileTableOutputReferences,
  removeElementsFromTemplate,
} from '@/engine/core/elementEditing.js';
import { expandElementIdsToGroups, normalizeElementGroups, remapElementGroupIds } from '@/engine/core/elementGroups.js';
import {
  type ElementPathPatch,
  setElementPath,
} from '@/engine/core/elementPath.js';
import { remapElementOutputReferences } from '@/engine/core/elementOutputReferences.js';
import type { AnyLayoutPDFPlugin, PluginRegistry } from '@/engine/core/plugin.js';
import { createPluginRegistry } from '@/engine/core/pluginRegistry.js';
import { removeSummaryReferences } from '@/engine/core/summaryReferences.js';
import {
  remapTablePaginationElementReferences,
  removeTablePaginationElementReferences,
} from '@/engine/core/tablePaginationReferences.js';
import {
  assertValidTemplateFile,
  TemplateFileSchema,
} from '@/engine/core/validation.js';
import { parseTemplateJson, stringifyTemplateJson } from '@/engine/templateJson.js';
import type {
  AddElementOptions,
  AddPageOptions,
} from '@/engine/templateBuilder.js';
import { LayoutPDFRuntimeError } from '@/engine/utils/errors.js';

export interface TemplateEditorOptions {
  /** Required by {@link TemplateEditor.addElement}; not needed for edits on existing elements. */
  plugins?: PluginRegistry | readonly AnyLayoutPDFPlugin[];
  idGenerator?: IdGenerator;
  /** Validate on the next read. Defaults to `true`. */
  validate?: boolean;
}

export interface CreateTemplateEditorOptions
  extends CreateBlankTemplateOptions, TemplateEditorOptions {}

export interface EditorAddPageOptions extends AddPageOptions {
  /** Insert at this page index. Takes precedence over `afterPageId`. */
  index?: number;
  /** Insert directly after this page id. */
  afterPageId?: string;
}

export interface EditorAddElementOptions extends AddElementOptions {
  /** Target page id. Defaults to the first page. */
  pageId?: string;
  /** Insert at this element index. Defaults to appending on top. */
  index?: number;
}

export interface PagePatch {
  size?: { width: number; height: number };
  padding?: [number, number, number, number];
  background?: TemplatePage['background'];
}

export interface ElementLocation {
  pageId: string;
  pageIndex: number;
  element: TemplateElement<object>;
}

export interface DuplicateElementsResult {
  id: string;
  pageId: string;
}

export interface EditorDuplicateElementsOptions {
  /** Offset copied boxes when `boxes` is not given. Defaults to `{ x: 5, y: 5 }`. */
  offset?: { x: number; y: number };
  /** Explicit target boxes keyed by source element id. */
  boxes?: Record<string, ElementBox>;
  /** Expand ids to every member of the same group. Defaults to `false`. */
  expandGroups?: boolean;
}

export interface EditorRemoveElementsOptions {
  expandGroups?: boolean;
  includeLocked?: boolean;
  /** Ignore ids that do not exist instead of throwing. Defaults to `false`. */
  ignoreMissing?: boolean;
}

export interface EditorUpdateElementOptions {
  /** Allow editing locked elements (for example to unlock them). Defaults to `false`. */
  force?: boolean;
}

export interface EditorMoveElementsOptions {
  /** Destination page. Defaults to each element's current page. */
  pageId?: string;
  /** Insertion index in the destination page's element list. */
  index?: number;
  /** Optional position offset applied while moving. */
  offset?: { x: number; y: number };
  /** Expand ids to every member of the same group. Defaults to `false`. */
  expandGroups?: boolean;
}

interface ResolvedElement {
  page: TemplatePage;
  element: TemplateElement<object>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function applyOffset(element: TemplateElement<object>, offset?: { x: number; y: number }): void {
  if (!offset) return;
  element.box = {
    ...element.box,
    x: element.box.x + offset.x,
    y: element.box.y + offset.y,
  };
}

function toPluginRegistry(
  plugins?: PluginRegistry | readonly AnyLayoutPDFPlugin[],
): PluginRegistry | undefined {
  if (!plugins) return undefined;
  if (Array.isArray(plugins)) {
    return createPluginRegistry(plugins as readonly AnyLayoutPDFPlugin[]);
  }
  return plugins as PluginRegistry;
}

/**
 * Headless, mutable template editor.
 *
 * Unlike {@link TemplateBuilder}, which only appends content, this API can
 * update, remove, move and duplicate existing pages/elements while keeping
 * template-owned identities (table columns/rows/footers, groups, pagination
 * lists and summary references) consistent.
 *
 * All reads return deep clones, so callers cannot accidentally mutate the
 * editor's internal document.
 */
export class TemplateEditor {
  private readonly file: TemplateFile;
  private readonly plugins?: PluginRegistry;
  private readonly idGenerator: IdGenerator;
  private readonly validateOnWrite: boolean;

  constructor(
    input: TemplateFile | string,
    options: TemplateEditorOptions = {},
  ) {
    this.plugins = toPluginRegistry(options.plugins);
    this.idGenerator = options.idGenerator ?? createId;
    this.validateOnWrite = options.validate ?? true;

    if (typeof input === 'string') {
      this.file = parseTemplateJson(input);
    } else {
      const copy = structuredClone(input);
      if (this.validateOnWrite) assertValidTemplateFile(copy);
      this.file = copy;
    }
  }

  /** Create an editor around a fresh blank template. */
  static create(options: CreateTemplateEditorOptions = {}): TemplateEditor {
    const {
      plugins,
      validate,
      idGenerator,
      ...blankOptions
    } = options;
    return new TemplateEditor(
      createBlankTemplateFile({ ...blankOptions, idGenerator }),
      { plugins, validate, idGenerator },
    );
  }

  /* ------------------------------------------------------------------ */
  /* Reads                                                              */
  /* ------------------------------------------------------------------ */

  get templateId(): string {
    return this.file.template.id;
  }

  get name(): string {
    return this.file.template.name;
  }

  /** Validated snapshot of the template. */
  toFile(): TemplateFile {
    const copy = structuredClone(this.file);
    if (!this.validateOnWrite) return copy;
    const parsed = TemplateFileSchema.parse(copy);
    assertValidTemplateFile(parsed);
    return structuredClone(parsed);
  }

  /** Alias for {@link TemplateEditor.toFile}. */
  build(): TemplateFile {
    return this.toFile();
  }

  toJson(space = 2): string {
    return stringifyTemplateJson(this.toFile(), { space });
  }

  get template(): LayoutPDFTemplate {
    return this.toFile().template;
  }

  get pages(): TemplatePage[] {
    return structuredClone(this.file.template.pages);
  }

  getPage(pageId: string): TemplatePage | undefined {
    const page = this.file.template.pages.find(candidate => candidate.id === pageId);
    return page ? structuredClone(page) : undefined;
  }

  getElement(elementId: string): ElementLocation | undefined {
    const resolved = this.findElement(elementId);
    if (!resolved) return undefined;
    return {
      pageId: resolved.page.id,
      pageIndex: this.file.template.pages.indexOf(resolved.page),
      element: structuredClone(resolved.element),
    };
  }

  listElements(pageId?: string): ElementLocation[] {
    const pages = pageId ? [this.requirePage(pageId)] : this.file.template.pages;
    return pages.flatMap(page => {
      const pageIndex = this.file.template.pages.indexOf(page);
      return page.elements.map(element => ({
        pageId: page.id,
        pageIndex,
        element: structuredClone(element),
      }));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Template-level operations                                          */
  /* ------------------------------------------------------------------ */

  rename(name: string): this {
    this.file.template.name = name;
    return this;
  }

  setMetadata(metadata: TemplateMetadata): this {
    this.file.template.metadata = structuredClone(metadata);
    return this;
  }

  /** Deep-copy the whole document under a new template id. */
  cloneAs(newTemplateId: string): TemplateEditor {
    return new TemplateEditor(
      cloneTemplateFileWithNewIds(this.file, newTemplateId, this.idGenerator),
      {
        plugins: this.plugins,
        idGenerator: this.idGenerator,
        validate: this.validateOnWrite,
      },
    );
  }

  /* ------------------------------------------------------------------ */
  /* Page operations                                                    */
  /* ------------------------------------------------------------------ */

  addPage(options: EditorAddPageOptions = {}): TemplatePage {
    const pages = this.file.template.pages;
    if (options.id && pages.some(page => page.id === options.id)) {
      throw new LayoutPDFRuntimeError(
        'PAGE_ID_CONFLICT',
        `Template page id already exists: ${options.id}`,
        { pageId: options.id },
      );
    }
    const reference = pages[pages.length - 1];
    const page: TemplatePage = {
      id: options.id ?? this.idGenerator('page'),
      size: { ...(options.size ?? reference.size) },
      padding: [...(options.padding ?? reference.padding)],
      background: structuredClone(options.background ?? { kind: 'blank', color: '#ffffff' }),
      elements: [],
    };
    let index = pages.length;
    if (options.index !== undefined) {
      index = clamp(options.index, 0, pages.length);
    } else if (options.afterPageId !== undefined) {
      const after = pages.findIndex(candidate => candidate.id === options.afterPageId);
      if (after < 0) throw this.pageNotFound(options.afterPageId);
      index = after + 1;
    }
    pages.splice(index, 0, page);
    return structuredClone(page);
  }

  updatePage(pageId: string, patch: PagePatch): TemplatePage {
    const page = this.requirePage(pageId);
    const padding = patch.padding
      ? patch.padding.map(value => Math.max(0, value)) as TemplatePage['padding']
      : page.padding;
    const width = patch.size?.width ?? page.size.width;
    const height = patch.size?.height ?? page.size.height;
    if (padding[1] + padding[3] >= width || padding[0] + padding[2] >= height) {
      throw new LayoutPDFRuntimeError(
        'INVALID_PAGE_PADDING',
        'Page padding must leave a positive content area.',
        { pageId },
      );
    }
    page.padding = [...padding];
    if (patch.size) page.size = { ...patch.size };
    if (patch.background) page.background = structuredClone(patch.background);
    return structuredClone(page);
  }

  removePage(pageId: string): string {
    const pages = this.file.template.pages;
    const index = pages.findIndex(page => page.id === pageId);
    if (index < 0) throw this.pageNotFound(pageId);
    if (pages.length <= 1) {
      throw new LayoutPDFRuntimeError(
        'LAST_PAGE_REQUIRED',
        'A template must keep at least one page.',
        { pageId },
      );
    }
    pages.splice(index, 1);
    return pageId;
  }

  movePage(pageId: string, toIndex: number): TemplatePage[] {
    const pages = this.file.template.pages;
    const index = pages.findIndex(page => page.id === pageId);
    if (index < 0) throw this.pageNotFound(pageId);
    const [page] = pages.splice(index, 1);
    pages.splice(clamp(toIndex, 0, pages.length), 0, page);
    return structuredClone(pages);
  }

  duplicatePage(
    pageId: string,
    options: { id?: string; index?: number } = {},
  ): TemplatePage {
    const pages = this.file.template.pages;
    const sourceIndex = pages.findIndex(page => page.id === pageId);
    if (sourceIndex < 0) throw this.pageNotFound(pageId);
    if (options.id && pages.some(page => page.id === options.id)) {
      throw new LayoutPDFRuntimeError(
        'PAGE_ID_CONFLICT',
        `Template page id already exists: ${options.id}`,
        { pageId: options.id },
      );
    }
    const copy = this.clonePage(pages[sourceIndex], options.id);
    pages.splice(
      options.index === undefined
        ? sourceIndex + 1
        : clamp(options.index, 0, pages.length),
      0,
      copy,
    );
    return structuredClone(copy);
  }

  /* ------------------------------------------------------------------ */
  /* Element operations                                                 */
  /* ------------------------------------------------------------------ */

  addElement(type: string, options: EditorAddElementOptions): TemplateElement<object> {
    if (!this.plugins) {
      throw new LayoutPDFRuntimeError(
        'PLUGIN_REGISTRY_REQUIRED',
        'TemplateEditor.addElement requires a plugin registry. Pass { plugins } to the constructor.',
        { elementType: type },
      );
    }
    const page = options.pageId === undefined
      ? this.file.template.pages[0]
      : this.requirePage(options.pageId);
    const id = options.id ?? this.idGenerator('el');
    if (this.findElement(id)) throw this.elementIdConflict(id);

    const plugin: AnyLayoutPDFPlugin = this.plugins.require(type);
    const element = plugin.createDefaultElement({
      id,
      position: {
        x: options.x ?? options.box?.x ?? 0,
        y: options.y ?? options.box?.y ?? 0,
      },
    });
    const next: TemplateElement<object> = {
      ...element,
      name: options.name ?? element.name,
      box: { ...element.box, ...options.box },
      rotate: options.rotate ?? element.rotate,
      opacity: options.opacity ?? element.opacity,
      locked: options.locked ?? element.locked,
      hidden: options.hidden ?? element.hidden,
      props: { ...element.props, ...options.props },
    };
    if (Object.prototype.hasOwnProperty.call(options, 'value')) next.value = options.value!;
    if (options.binding) next.binding = { ...options.binding };
    this.insertIntoPage(page, next, options.index);
    return structuredClone(next);
  }

  /** Insert an already-built element (no plugin registry required). */
  insertElement(
    element: TemplateElement<object>,
    options: { pageId?: string; index?: number } = {},
  ): TemplateElement<object> {
    const page = options.pageId === undefined
      ? this.file.template.pages[0]
      : this.requirePage(options.pageId);
    if (this.findElement(element.id)) throw this.elementIdConflict(element.id);
    const copy = structuredClone(element);
    this.insertIntoPage(page, copy, options.index);
    return structuredClone(copy);
  }

  updateElement(
    elementId: string,
    patch: ElementPathPatch | readonly ElementPathPatch[],
    options: EditorUpdateElementOptions = {},
  ): TemplateElement<object> {
    const patches = Array.isArray(patch) ? patch : [patch as ElementPathPatch];
    const resolved = this.requireElement(elementId);
    if (resolved.element.locked && !options.force) {
      const onlyLockToggle = patches.every(candidate => candidate.path === 'locked');
      if (!onlyLockToggle) {
        throw new LayoutPDFRuntimeError(
          'ELEMENT_LOCKED',
          `Element is locked: ${elementId}`,
          { elementId },
        );
      }
    }
    for (const candidate of patches) {
      setElementPath(resolved.element, candidate);
    }
    reconcileTableOutputReferences(this.file.template, new Set([elementId]));
    return structuredClone(resolved.element);
  }

  updateElements(
    elementIds: readonly string[],
    patch: ElementPathPatch | readonly ElementPathPatch[],
    options: EditorUpdateElementOptions = {},
  ): TemplateElement<object>[] {
    return elementIds.map(elementId => this.updateElement(elementId, patch, options));
  }

  /** Replace an element's box in one call. */
  setElementBox(
    elementId: string,
    box: ElementBox,
    options: EditorUpdateElementOptions = {},
  ): TemplateElement<object> {
    return this.updateElement(elementId, { path: 'box', value: { ...box } }, options);
  }

  removeElement(
    elementId: string,
    options: EditorRemoveElementsOptions = {},
  ): string[] {
    return this.removeElements([elementId], options);
  }

  removeElements(
    ids: readonly string[],
    options: EditorRemoveElementsOptions = {},
  ): string[] {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    if (!options.ignoreMissing) {
      const missing = unique.filter(id => !this.findElement(id));
      if (missing.length > 0) throw this.elementNotFound(missing[0]);
    }
    return removeElementsFromTemplate(this.file.template, unique, {
      expandGroups: options.expandGroups,
      includeLocked: options.includeLocked,
    });
  }

  duplicateElement(
    elementId: string,
    options: EditorDuplicateElementsOptions = {},
  ): DuplicateElementsResult[] {
    return this.duplicateElements([elementId], options);
  }

  duplicateElements(
    ids: readonly string[],
    options: EditorDuplicateElementsOptions = {},
  ): DuplicateElementsResult[] {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const missing = unique.filter(id => !this.findElement(id));
    if (missing.length > 0) throw this.elementNotFound(missing[0]);

    const requested = new Set(unique);
    const boxes = options.boxes ? new Map(Object.entries(options.boxes)) : undefined;
    const existingIds = new Set<string>();
    for (const page of this.file.template.pages) {
      for (const element of page.elements) existingIds.add(element.id);
    }
    const results: DuplicateElementsResult[] = [];
    for (const page of this.file.template.pages) {
      const additions = duplicateElementsInPage(page, requested, this.idGenerator, {
        boxes,
        offset: options.offset,
        expandGroups: options.expandGroups,
      });
      if (additions.length === 0) continue;
      const additionIds = additions.map(addition => addition.id);
      if (
        new Set(additionIds).size !== additionIds.length
        || additionIds.some(id => existingIds.has(id))
      ) {
        const conflict = additionIds.find(id => existingIds.has(id)) ?? additionIds[0];
        throw this.elementIdConflict(conflict);
      }
      page.elements.push(...additions);
      for (const addition of additions) {
        existingIds.add(addition.id);
        results.push({ id: addition.id, pageId: page.id });
      }
    }
    return results;
  }

  moveElement(
    elementId: string,
    options: EditorMoveElementsOptions = {},
  ): string[] {
    return this.moveElements([elementId], options);
  }

  /**
   * Move elements to a page/index and/or apply a position offset.
   *
   * Moving an element to another page removes summary and table pagination
   * references that would otherwise point across pages.
   */
  moveElements(
    ids: readonly string[],
    options: EditorMoveElementsOptions = {},
  ): string[] {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const targetPage = options.pageId === undefined
      ? undefined
      : this.requirePage(options.pageId);

    const requested = new Set(unique);
    const entries: Array<ResolvedElement & { destination: TemplatePage }> = [];
    for (const page of this.file.template.pages) {
      const targets = options.expandGroups
        ? new Set(expandElementIdsToGroups(page, [...requested]))
        : requested;
      for (const element of page.elements) {
        if (!targets.has(element.id)) continue;
        entries.push({
          page,
          element,
          destination: targetPage ?? page,
        });
      }
    }
    const missing = unique.filter(id => !entries.some(entry => entry.element.id === id));
    if (missing.length > 0) throw this.elementNotFound(missing[0]);

    for (const entry of entries) applyOffset(entry.element, options.offset);

    const relocating = entries.filter(entry =>
      entry.destination !== entry.page || options.index !== undefined
    );
    const movedOut = relocating.filter(entry => entry.destination !== entry.page);
    const movedOutBySource = new Map<TemplatePage, Set<string>>();
    for (const entry of movedOut) {
      let idsForPage = movedOutBySource.get(entry.page);
      if (!idsForPage) {
        idsForPage = new Set();
        movedOutBySource.set(entry.page, idsForPage);
      }
      idsForPage.add(entry.element.id);
    }
    for (const [source, movedIds] of movedOutBySource) {
      removeSummaryReferences(source, id => movedIds.has(id));
      removeTablePaginationElementReferences(source, id => movedIds.has(id));
    }

    const relocatingBySource = new Map<TemplatePage, Set<string>>();
    for (const entry of relocating) {
      let idsForPage = relocatingBySource.get(entry.page);
      if (!idsForPage) {
        idsForPage = new Set();
        relocatingBySource.set(entry.page, idsForPage);
      }
      idsForPage.add(entry.element.id);
    }
    for (const [source, movedIds] of relocatingBySource) {
      source.elements = source.elements.filter(element => !movedIds.has(element.id));
      normalizeElementGroups(source);
    }

    const byDestination = new Map<TemplatePage, TemplateElement<object>[]>();
    for (const entry of relocating) {
      const group = byDestination.get(entry.destination) ?? [];
      group.push(entry.element);
      byDestination.set(entry.destination, group);
    }
    for (const [destination, elements] of byDestination) {
      const index = options.index === undefined
        ? destination.elements.length
        : clamp(options.index, 0, destination.elements.length);
      destination.elements.splice(index, 0, ...elements);

      const destinationIds = new Set(destination.elements.map(element => element.id));
      const movedSummaries = elements.filter(element => element.type === 'summary');
      if (movedSummaries.length > 0) {
        removeSummaryReferences(
          { elements: movedSummaries },
          sourceId => !destinationIds.has(sourceId),
        );
      }
      const movedTables = elements.filter(element => element.type === 'table');
      if (movedTables.length > 0) {
        removeTablePaginationElementReferences(
          { elements: movedTables },
          id => !destinationIds.has(id),
        );
      }
      normalizeElementGroups(destination);
    }

    return entries.map(entry => entry.element.id);
  }

  /* ------------------------------------------------------------------ */
  /* Internals                                                          */
  /* ------------------------------------------------------------------ */

  private clonePage(source: TemplatePage, id?: string): TemplatePage {
    const page = structuredClone(source);
    page.id = id ?? this.idGenerator('page');
    const elementIds = new Map(source.elements.map(element => [element.id, this.idGenerator('el')]));
    const outputIdsBySource = new Map<string, ReadonlyMap<string, string>>();

    page.elements = source.elements.map(element => {
      const next = structuredClone(element);
      next.id = elementIds.get(element.id)!;
      const outputIds = remapTableIdentities(next, this.idGenerator);
      if (outputIds.size > 0) outputIdsBySource.set(element.id, outputIds);
      remapGridIdentities(next, this.idGenerator);
      return next;
    });

    const formulaOutputReferences = new Map<string, string>();
    for (const [oldElementId, outputIds] of outputIdsBySource) {
      const nextElementId = elementIds.get(oldElementId);
      if (!nextElementId) continue;
      for (const [oldOutputId, nextOutputId] of outputIds) {
        formulaOutputReferences.set(
          createFormulaOutputReference(oldElementId, oldOutputId),
          createFormulaOutputReference(nextElementId, nextOutputId),
        );
      }
    }
    remapFormulaOutputReferences(page.elements, formulaOutputReferences);
    remapElementGroupIds(page.elements, this.idGenerator);
    remapTablePaginationElementReferences(page.elements, elementIds, { dropUnmapped: true });
    remapElementOutputReferences(page.elements, { elementIds, outputIdsBySource });
    normalizeElementGroups(page);
    return page;
  }

  private insertIntoPage(
    page: TemplatePage,
    element: TemplateElement<object>,
    index?: number,
  ): void {
    const insertAt = index === undefined
      ? page.elements.length
      : clamp(index, 0, page.elements.length);
    page.elements.splice(insertAt, 0, element);
  }

  private findElement(elementId: string): ResolvedElement | undefined {
    for (const page of this.file.template.pages) {
      const element = page.elements.find(candidate => candidate.id === elementId);
      if (element) return { page, element };
    }
    return undefined;
  }

  private requirePage(pageId: string): TemplatePage {
    const page = this.file.template.pages.find(candidate => candidate.id === pageId);
    if (!page) throw this.pageNotFound(pageId);
    return page;
  }

  private requireElement(elementId: string): ResolvedElement {
    const resolved = this.findElement(elementId);
    if (!resolved) throw this.elementNotFound(elementId);
    return resolved;
  }

  private pageNotFound(pageId: string): LayoutPDFRuntimeError {
    return new LayoutPDFRuntimeError(
      'PAGE_NOT_FOUND',
      `Template page not found: ${pageId}`,
      { pageId },
    );
  }

  private elementNotFound(elementId: string): LayoutPDFRuntimeError {
    return new LayoutPDFRuntimeError(
      'ELEMENT_NOT_FOUND',
      `Template element not found: ${elementId}`,
      { elementId },
    );
  }

  private elementIdConflict(elementId: string): LayoutPDFRuntimeError {
    return new LayoutPDFRuntimeError(
      'ELEMENT_ID_CONFLICT',
      `Template element id already exists: ${elementId}`,
      { elementId },
    );
  }
}
