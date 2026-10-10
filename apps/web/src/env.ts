export interface ChatConfig {
  apiKey: string;
  model: string;
  instructions: string;
}

export interface WindowConfig {
  alwaysOnTop: boolean;
}

export type AppConfig = ChatConfig & WindowConfig;

declare global {
  interface Window {
    nativeApi?: {
      platform: string;
      resizeChatWindow: (size: { width: number; height: number }) => void;
      resizeChatWindowEnd: () => void;
      minimizeToBubble: () => void;
      expandFromBubble: () => void;
      saveApiKey: (key: string) => void;
      getConfig: () => Promise<AppConfig>;
      saveConfig: (config: AppConfig) => Promise<void>;
      closeWindow: () => void;
    };
    desktopBridge?: unknown;
  }
}

export const isElectron =
  typeof window !== "undefined" &&
  (window.desktopBridge !== undefined || window.nativeApi !== undefined);
