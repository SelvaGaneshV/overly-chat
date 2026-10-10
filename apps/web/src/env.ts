export interface ChatConfig {
  apiKey: string;
  model: string;
  instructions: string;
  persona?: string;
}

export interface WindowConfig {
  alwaysOnTop: boolean;
  opacity?: number;
}

export type AppConfig = ChatConfig & WindowConfig;

export type WindowSnapPosition =
  | "left-half"
  | "right-half"
  | "right-sidebar"
  | "left-sidebar"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center"
  | "maximize"
  | "restore";

export interface OpenWindowInfo {
  id: string;
  name: string;
  thumbnail: string;
  appIcon?: string;
}

declare global {
  interface Window {
    nativeApi?: {
      platform: string;
      snapWindow?: (position: WindowSnapPosition) => void;
      resizeChatWindow: (size: { width: number; height: number }) => void;
      resizeChatWindowEnd: () => void;
      minimizeToBubble: () => void;
      expandFromBubble: () => void;
      getConfig: () => Promise<AppConfig>;
      saveConfig: (config: AppConfig) => Promise<void>;
      closeWindow: () => void;
      setGhostMode: (enabled: boolean) => void;
      captureScreen: () => Promise<string | null>;
      getOpenWindows?: () => Promise<OpenWindowInfo[]>;
      captureWindow?: (windowId: string) => Promise<string | null>;
      onGhostModeChange: (callback: (enabled: boolean) => void) => () => void;
      onRequestMinimize?: (callback: () => void) => () => void;
      onRequestExpand?: (callback: () => void) => () => void;
    };
    desktopBridge?: unknown;
  }
}

export const isElectron =
  typeof window !== "undefined" &&
  (window.desktopBridge !== undefined || window.nativeApi !== undefined);
