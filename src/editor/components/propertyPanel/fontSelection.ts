import type { FontFamilyInfo } from '@/engine/pdf/font/fontManager.js';

export interface FontSelectOption {
  value: string;
  label: string;
}

export interface FontSelection {
  /** Value the picker should show for this element. */
  value: string;
  options: FontSelectOption[];
}

/**
 * Builds the option list for `props.fontName`.
 *
 * The stored value is a face name, but a picker shows families: the element's
 * own weight toggle chooses the matching face, so picking "Noto Sans CJK JP"
 * must not pin every element to the Bold face. A value that no family covers
 * is kept as its own option instead of silently displaying "inherit".
 */
export function resolveFontSelection(
  families: readonly FontFamilyInfo[],
  current: string,
  inheritLabel: string,
): FontSelection {
  const options: FontSelectOption[] = [{ value: '', label: inheritLabel }];
  for (const family of families) {
    options.push({ value: family.defaultFace, label: family.family });
  }

  const family = current
    ? families.find(candidate =>
      candidate.family === current
      || candidate.faces.some(face => face.name === current))
    : undefined;
  const value = family ? family.defaultFace : current;
  if (value && !options.some(option => option.value === value)) {
    options.push({ value, label: current });
  }
  return { value, options };
}
