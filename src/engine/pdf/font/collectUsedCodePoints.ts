import type {
  RenderDocument,
  RenderNode,
  TextFontRun,
  TextLayoutLine,
} from '@/engine/renderTree/model.js';

export function collectRenderedText(document: RenderDocument): string[] {
  const texts = new Set<string>();
  for (const page of document.pages) {
    for (const node of page.nodes) {
      addNodeText(node, texts);
    }
  }
  return [...texts];
}

export function collectUsedCodePoints(document: RenderDocument): Set<number> {
  const codepoints = baseCodePoints();
  for (const text of collectRenderedText(document)) addText(text, codepoints);
  return codepoints;
}

export function collectUsedCodePointsByFont(
  document: RenderDocument,
  defaultFontName: string,
): Map<string, Set<number>> {
  const byFont = new Map<string, Set<number>>();
  const add = (fontName: string | undefined, text: string) => {
    if (!text) return;
    const name = fontName || defaultFontName;
    let codepoints = byFont.get(name);
    if (!codepoints) {
      codepoints = baseCodePoints();
      byFont.set(name, codepoints);
    }
    addText(text, codepoints);
  };

  // A subset only needs the code points that its own face will draw. Lines
  // split by the fallback chain therefore attribute each run separately.
  const addLine = (fontName: string | undefined, line: TextLayoutLine) => {
    if (line.runs) {
      for (const run of line.runs) add(run.fontName, run.text);
      return;
    }
    add(fontName, line.text);
  };
  const addRuns = (fontName: string | undefined, runs: TextFontRun[] | undefined, text: string) => {
    if (runs) {
      for (const run of runs) add(run.fontName, run.text);
      return;
    }
    add(fontName, text);
  };

  for (const page of document.pages) {
    for (const node of page.nodes) {
      switch (node.kind) {
        case 'text':
          for (const line of node.layout.lines) addLine(node.style.fontName, line);
          break;
        case 'table':
          for (const cell of node.layout.cells) {
            for (const line of cell.lines ?? []) addLine(cell.fontName, line);
            if (!cell.lines) addRuns(cell.fontName, cell.textRuns, cell.text);
            addRuns(cell.fontName, cell.prefixTextRuns, cell.prefixText ?? '');
          }
          break;
        case 'grid':
          for (const cell of node.layout.cells) {
            for (const line of cell.prefixLines ?? []) addLine(cell.fontName, line);
            for (const line of cell.lines) addLine(cell.fontName, line);
          }
          break;
        case 'plugin':
          for (const run of node.textRuns ?? []) add(run.fontName, run.text);
          break;
        case 'rect':
        case 'ellipse':
        case 'line':
        case 'image':
          break;
      }
    }
  }
  return byFont;
}

function baseCodePoints(): Set<number> {
  const codepoints = new Set<number>();
  for (let cp = 0x20; cp <= 0x7e; cp++) codepoints.add(cp);
  codepoints.add(0x0a).add(0x0d).add(0x3000).add(0x00a0);
  codepoints.add(0x00a5); // ¥ yen sign
  return codepoints;
}

function addNodeText(node: RenderNode, set: Set<string>): void {
  switch (node.kind) {
    case 'text':
      for (const line of node.layout.lines) addVisibleText(line.text, set);
      break;
    case 'table':
      for (const cell of node.layout.cells) {
        if (cell.lines) {
          for (const line of cell.lines) addVisibleText(line.text, set);
        } else {
          addVisibleText(cell.text, set);
        }
        addVisibleText(cell.prefixText ?? '', set);
      }
      break;
    case 'grid':
      for (const cell of node.layout.cells) {
        for (const line of cell.prefixLines ?? []) addVisibleText(line.text, set);
        for (const line of cell.lines) addVisibleText(line.text, set);
      }
      break;
    case 'plugin':
      for (const run of node.textRuns ?? []) addVisibleText(run.text, set);
      break;
    case 'rect':
    case 'ellipse':
    case 'line':
    case 'image':
      break;
  }
}

function addVisibleText(text: string, set: Set<string>): void {
  if (text) set.add(text);
}

function addText(text: string, set: Set<number>): void {
  if (!text) return;
  for (const char of text) {
    const cp = char.codePointAt(0);
    if (cp !== undefined) set.add(cp);
  }
}
