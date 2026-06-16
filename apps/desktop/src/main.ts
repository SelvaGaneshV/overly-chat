import { env } from "@overly-chat/env/desktop";
import { app, BrowserWindow, globalShortcut, ipcMain, nativeImage, safeStorage } from "electron";
import { fork, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

const readConfig = (): Record<string, string> => {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);
    if (config.apiKey && safeStorage.isEncryptionAvailable()) {
      config.apiKey = safeStorage.decryptString(Buffer.from(config.apiKey, "base64"));
    }
    return config;
  } catch {
    return {};
  }
};

const writeConfig = (data: Record<string, string>) => {
  const toSave = { ...data };
  if (toSave.apiKey && safeStorage.isEncryptionAvailable()) {
    toSave.apiKey = safeStorage.encryptString(toSave.apiKey).toString("base64");
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(toSave), "utf-8");
};

let serverProcess: ChildProcess | null = null;

const startServer = (config: Record<string, string>) => {
  serverProcess = fork(path.join(__dirname, "server.cjs"), [], {
    stdio: "inherit",
    env: {
      ...process.env,
      OPENROUTER_API_KEY: config.apiKey,
      AGENT_MODEL: config.model ?? "",
      AGENT_INSTRUCTIONS: config.instructions ?? "",
      PORT: "3000",
    },
  });
};

const DEV_SERVER_URL = env.CORS_ORIGIN;
const isDev = !app.isPackaged;

const appIcon = nativeImage.createFromPath(
  path.join(__dirname, "..", "assets", "icons", "png", "256x256.png"),
);

const createSetupWindow = () =>
  new Promise<void>((resolve) => {
    const win = new BrowserWindow({
      width: 480,
      height: 300,
      resizable: false,
      frame: false,
      alwaysOnTop: true,
      icon: appIcon,
      webPreferences: { preload: path.join(__dirname, "preload.cjs") },
    });

    if (isDev) {
      win.loadURL(`${DEV_SERVER_URL}/setup.html`);
    } else {
      win.loadFile(path.join(__dirname, "renderer", "setup.html"));
    }

    ipcMain.once("api-key-saved", () => {
      win.close();
      resolve();
    });
  });

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    frame: false,
    fullscreen: true,
    alwaysOnTop: true,
    focusable: false,
    transparent: true,
    skipTaskbar: true,
    hasShadow: false,
    icon: appIcon,
    webPreferences: { preload: path.join(__dirname, "preload.cjs") },
  });

  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setContentProtection(true);

  ipcMain.on("set-ignore-mouse-events", (_, ignore: boolean) => {
    mainWindow.setIgnoreMouseEvents(ignore, { forward: true });
  });

  ipcMain.on("close-window", () => {
    mainWindow.close();
  });

  ipcMain.on("set-interactive", (_, interactive: boolean) => {
    mainWindow.setIgnoreMouseEvents(!interactive, { forward: true });
    mainWindow.setFocusable(interactive);
    mainWindow.setSkipTaskbar(true);
  });

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  }
};

app.on("ready", async () => {
  if (process.platform === "win32") app.setAppUserModelId(" ");

  let config = readConfig();

  if (!config.apiKey) {
    ipcMain.on("save-api-key", (_, key: string) => {
      writeConfig({ apiKey: key });
      ipcMain.emit("api-key-saved");
    });
    await createSetupWindow();
    config = readConfig();
  }

  ipcMain.handle("get-config", () => {
    const c = readConfig();
    return { apiKey: c.apiKey ?? "", model: c.model ?? "", instructions: c.instructions ?? "" };
  });

  ipcMain.handle("save-config", (_, cfg: { apiKey: string; model: string; instructions: string }) => {
    writeConfig(cfg);
  });

  if (!isDev) startServer(config);

  createWindow();

  globalShortcut.register("CommandOrControl+Q", () => app.quit());
  globalShortcut.register("CommandOrControl+Shift+I", () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    win?.webContents.toggleDevTools();
  });
});

app.on("window-all-closed", () => {
  serverProcess?.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
