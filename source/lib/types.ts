import { Cookies } from 'webextension-polyfill-ts';

export type XhrEvent = { data: XhrData }

export interface XhrData {
  status: string;
  url: string;
  html?: string;
  errors?: string[];
  requestCookies?: Record<string, string>;
  responseCookies?: Record<string, string>;
}

export type BooleanString = 'yes' | 'no';

export type Settings = {
  closeTabOnPost: BooleanString;
  timeToClose: string;
  enableQuickFlood: BooleanString;
  enableLogs: BooleanString;
};

export type SettingsItem = keyof Settings;

export type ToolbarButtonSpecs = {
  onClick?: (anchor: HTMLSpanElement, inner: HTMLSpanElement, ripple: HTMLDivElement) => void;
  initialText: string;
};

export type ToolbarButtonSpecsResolver = () => ToolbarButtonSpecs | Promise<ToolbarButtonSpecs>;

export type AccountStatus = 'pending' | 'synced';

export interface UserProfile {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

export interface AccountState {
  id: string;
  name: string;
  cookies: Cookies.Cookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  timestamp: number;
  status: AccountStatus;
  isResyncing?: boolean;
  profile?: UserProfile;
}

export interface AccountStates {
  activeAccountId?: string;
  pendingAccountId?: string;
  accounts: Record<string, AccountState>;
}