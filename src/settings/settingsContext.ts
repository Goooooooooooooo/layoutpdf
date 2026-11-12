import { createContext, useContext } from 'react';
import type { BackupSettings, EditorPreferenceSettings, PdfMetadataSettings } from './settingsStorage.js';

export interface SettingsApi {
  defaultSavePath: string | null;
  setDefaultSavePath(path: string | null): void;
  pdfMetadata: PdfMetadataSettings;
  setPdfMetadata(metadata: PdfMetadataSettings): void;
  editor: EditorPreferenceSettings;
  setEditorPreferences(preferences: EditorPreferenceSettings): void;
  backup: BackupSettings;
  setBackup(backup: BackupSettings): void;
  exportFilenamePattern: string;
  setExportFilenamePattern(pattern: string): void;
}

export const SettingsContext = createContext<SettingsApi | null>(null);

export function useSettings(): SettingsApi {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
