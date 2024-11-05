export interface XhrData {
  status: string;
  url: string;
  html?: string;
  errors?: string[];
}

export type BooleanString = 'yes' | 'no';

export type Settings = {
  closeTabOnPost: BooleanString;
  timeToClose: string;
  maxNumberOfVisibleThreadsBeforeHalt: string;
};

export type SettingsItem = keyof Settings;


export type ToolbarButtonSpecs = {
  onClick?: (anchor: HTMLSpanElement, inner: HTMLSpanElement, ripple: HTMLDivElement) => void;
  initialText: string;
};

export type ToolbarButtonSpecsResolver = () => ToolbarButtonSpecs | Promise<ToolbarButtonSpecs>;