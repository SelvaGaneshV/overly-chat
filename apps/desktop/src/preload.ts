import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('nativeApi', {
  platform: process.platform,
  setIgnoreMouseEvents: (ignore: boolean) =>
    ipcRenderer.send('set-ignore-mouse-events', ignore),
  setInteractive: (interactive: boolean) =>
    ipcRenderer.send('set-interactive', interactive),
  saveApiKey: (key: string) =>
    ipcRenderer.send('save-api-key', key),
  getConfig: (): Promise<{ apiKey: string; model: string; instructions: string }> =>
    ipcRenderer.invoke('get-config'),
  saveConfig: (config: { apiKey: string; model: string; instructions: string }) =>
    ipcRenderer.invoke('save-config', config),
  closeWindow: () =>
    ipcRenderer.send('close-window'),
});
