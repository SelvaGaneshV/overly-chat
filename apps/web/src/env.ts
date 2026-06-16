declare global {
  interface Window {
    nativeApi?: {
      platform: string;
      setIgnoreMouseEvents: (ignore: boolean) => void;
      setInteractive: (interactive: boolean) => void;
      saveApiKey: (key: string) => void;
      getConfig: () => Promise<{ apiKey: string; model: string; instructions: string }>;
      saveConfig: (config: { apiKey: string; model: string; instructions: string }) => Promise<void>;
      closeWindow: () => void;
    };
    desktopBridge?: unknown;
  }
}

export const isElectron =
  typeof window !== "undefined" &&
  (window.desktopBridge !== undefined || window.nativeApi !== undefined);
