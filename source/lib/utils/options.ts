import { Settings, SettingsItem } from '@lib/types';
import { browser } from 'webextension-polyfill-ts';

// Default settings to be used throughout the application
export const defaultSettings: Settings = {
  closeTabOnPost: 'no',
  timeToClose: '10',
  enableQuickFlood: 'yes',
};

export async function getSettings(filter?: SettingsItem[] | SettingsItem): Promise<Settings> {
  const settings = await browser.storage.local.get(filter || null);
  
  // Merge with default settings to ensure all properties have values
  return {
    ...defaultSettings,
    ...settings,
  } as Settings;
}

export async function setSettings(settings: Partial<Settings>): Promise<void> {
  const originalSettings = await getSettings();
  await browser.storage.local.set({
    ...originalSettings,
    ...settings,
  });
}

export async function getConfig<T extends keyof Settings>(key: SettingsItem): Promise<Settings[T]> {
  const config = await browser.storage.local.get(key);
  // Return stored value or default if not stored
  return (key in config) ? config[key] : defaultSettings[key];
}

export async function setConfig<T extends keyof Settings>(
  key: SettingsItem,
  value: Settings[T],
): Promise<void> {
  await browser.storage.local.set({ [key]: value });
}
