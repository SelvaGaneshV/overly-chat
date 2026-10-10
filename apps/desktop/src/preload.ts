import { contextBridge, ipcRenderer } from "electron";

export interface ChatConfig {
  apiKey: string;
  model: string;
  instructions: string;
}

export interface WindowConfig {
  alwaysOnTop: boolean;
}

export type AppConfig = ChatConfig & WindowConfig;

export type ChatWindowSize = {
  width: number;
  height: number;
};

contextBridge.exposeInMainWorld("nativeApi", {
  platform: process.platform,
  resizeChatWindow: (size: ChatWindowSize) => ipcRenderer.send("resize-chat-window", size),
  resizeChatWindowEnd: () => ipcRenderer.send("resize-chat-window-end"),
  minimizeToBubble: () => ipcRenderer.send("minimize-to-bubble"),
  expandFromBubble: () => ipcRenderer.send("expand-from-bubble"),
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke("get-config"),
  saveConfig: (config: AppConfig) => ipcRenderer.invoke("save-config", config),
  closeWindow: () => ipcRenderer.send("close-window"),
});
