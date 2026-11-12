const SETTINGS_KEY = 'layoutpdf-settings';

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function getDefaultSettingsStorage(): SettingsStorage | undefined {
  try {
    if (typeof window === 'undefined') return undefined;
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export interface PdfMetadataSettings {
  author?: string;
  keywords?: string[];
  fontSubsetting?: boolean;
}

export interface EditorPreferenceSettings {
  showGrid: boolean;
  snapEnabled: boolean;
  paletteCollapsed?: boolean;
  palettePanelWidth?: number;
  propertiesCollapsed?: boolean;
  propertiesPanelWidth?: number;
}

export interface BackupSettings {
  autoBackupEnabled: boolean;
  autoBackupIntervalMinutes: number;
}

export interface AppSettings {
  defaultSavePath: string | null;
  pdfMetadata: PdfMetadataSettings;
  editor: EditorPreferenceSettings;
  backup: BackupSettings;
  exportFilenamePattern: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultSavePath: null,
  pdfMetadata: {},
  editor: {
    showGrid: true,
    snapEnabled: true,
  },
  backup: {
    autoBackupEnabled: true,
    autoBackupIntervalMinutes: 10,
  },
  exportFilenamePattern: '',
};

export function readSettings(
  storage: SettingsStorage | undefined = getDefaultSettingsStorage(),
  key = SETTINGS_KEY,
): AppSettings {
  if (!storage) return DEFAULT_SETTINGS;
  try {
    const raw = storage.getItem(key);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      pdfMetadata: { ...DEFAULT_SETTINGS.pdfMetadata, ...parsed.pdfMetadata },
      editor: { ...DEFAULT_SETTINGS.editor, ...parsed.editor },
      backup: { ...DEFAULT_SETTINGS.backup, ...parsed.backup },
      exportFilenamePattern: typeof parsed.exportFilenamePattern === 'string'
        ? parsed.exportFilenamePattern
        : DEFAULT_SETTINGS.exportFilenamePattern,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(
  settings: AppSettings,
  storage: SettingsStorage | undefined = getDefaultSettingsStorage(),
  key = SETTINGS_KEY,
): void {
  storage?.setItem(key, JSON.stringify(settings));
}

/**
 * Reads only editor preferences. Useful for hosts that persist designer UI
 * state separately from PDF/export settings.
 */
export function readEditorPreferences(
  storage: SettingsStorage | undefined = getDefaultSettingsStorage(),
  key = SETTINGS_KEY,
): EditorPreferenceSettings {
  return readSettings(storage, key).editor;
}

export function writeEditorPreferences(
  editor: EditorPreferenceSettings,
  storage: SettingsStorage | undefined = getDefaultSettingsStorage(),
  key = SETTINGS_KEY,
): void {
  const current = readSettings(storage, key);
  writeSettings({ ...current, editor }, storage, key);
}
