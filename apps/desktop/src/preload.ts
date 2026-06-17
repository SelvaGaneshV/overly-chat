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

contextBridge.exposeInMainWorld("nativeApi", {
  platform: process.platform,
  setIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.send("set-ignore-mouse-events", ignore),
  setInteractive: (interactive: boolean) => ipcRenderer.send("set-interactive", interactive),
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke("get-config"),
  saveConfig: (config: AppConfig) => ipcRenderer.invoke("save-config", config),
  closeWindow: () => ipcRenderer.send("close-window"),
});
