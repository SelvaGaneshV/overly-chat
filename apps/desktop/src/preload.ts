import { contextBridge, ipcRenderer } from "electron";

export interface ChatConfig {
  apiKey: string;
  model: string;
  instructions: string;
  persona?: string;
  workingDir?: string;
  shareWindows?: boolean;
}

export interface WindowConfig {
  alwaysOnTop: boolean;
  opacity?: number;
}

export type AppConfig = ChatConfig & WindowConfig;

export type ChatWindowSize = {
  width: number;
  height: number;
};

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

contextBridge.exposeInMainWorld("isElectron", true);
contextBridge.exposeInMainWorld("desktopBridge", true);

contextBridge.exposeInMainWorld("nativeApi", {
  isElectron: true,
  platform: process.platform,
  snapWindow: (position: WindowSnapPosition) => ipcRenderer.send("snap-window", position),
  resizeChatWindow: (size: ChatWindowSize) => ipcRenderer.send("resize-chat-window", size),
  resizeChatWindowEnd: () => ipcRenderer.send("resize-chat-window-end"),
  minimizeToBubble: () => ipcRenderer.send("minimize-to-bubble"),
  expandFromBubble: () => ipcRenderer.send("expand-from-bubble"),
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke("get-config"),
  saveConfig: (config: AppConfig) => ipcRenderer.invoke("save-config", config),
  getServerInfo: (): Promise<{ port: number; url: string; token: string }> =>
    ipcRenderer.invoke("get-server-info"),
  closeWindow: () => ipcRenderer.send("close-window"),
  setGhostMode: (enabled: boolean) => ipcRenderer.send("set-ghost-mode", enabled),
  captureScreen: (): Promise<string | null> => ipcRenderer.invoke("capture-screen"),
  getOpenWindows: (opts?: { thumbnails?: boolean }): Promise<OpenWindowInfo[]> =>
    ipcRenderer.invoke("get-open-windows", opts),
  captureWindow: (windowId: string): Promise<string | null> =>
    ipcRenderer.invoke("capture-window", windowId),
  supportsTerminal: true,
  onGhostModeChange: (callback: (enabled: boolean) => void) => {
    const handler = (_: unknown, enabled: boolean) => callback(enabled);
    ipcRenderer.on("ghost-mode-changed", handler);
    return () => {
      ipcRenderer.removeListener("ghost-mode-changed", handler);
    };
  },
  onRequestMinimize: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("request-minimize", handler);
    return () => {
      ipcRenderer.removeListener("request-minimize", handler);
    };
  },
  onRequestExpand: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("request-expand", handler);
    return () => {
      ipcRenderer.removeListener("request-expand", handler);
    };
  },
  onConfigChange: (callback: (config: AppConfig) => void) => {
    const handler = (_: unknown, config: AppConfig) => callback(config);
    ipcRenderer.on("config-changed", handler);
    return () => {
      ipcRenderer.removeListener("config-changed", handler);
    };
  },
});
