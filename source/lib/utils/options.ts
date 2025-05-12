import { Settings, SettingsItem } from '@lib/types';
import { browser } from 'webextension-polyfill-ts';

// Default settings to be used throughout the application
export const defaultSettings: Settings = {
  closeTabOnPost: 'no',
  timeToClose: '10',
  enableQuickFlood: 'yes',
  enableLogs: 'no',
  // Default values for new Quick Flood settings
  autoCollapseThreadAfterPosting: 'yes',
  threadFrameHeight: '630',
  autoOpenNextThreadAfterPosting: 'no',
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
  console.log('setSettings called with:', settings);
  const originalSettings = await getSettings();
  console.log('Original settings before merge:', originalSettings);
  
  const finalSettings = {
    ...originalSettings,
    ...settings,
  };
  
  console.log('Final settings to be saved:', finalSettings);
  await browser.storage.local.set(finalSettings);
  
  // Verify save operation
  const verifySettings = await browser.storage.local.get(null);
  console.log('Verified settings after save:', verifySettings);
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
