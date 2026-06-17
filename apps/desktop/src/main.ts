import { env } from "@overly-chat/env/desktop";
import { app, BrowserWindow, globalShortcut, ipcMain, nativeImage, safeStorage } from "electron";
import { fork, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");
const SERVER_CONFIG_PATH = path.join(app.getPath("userData"), "server-config.json");

const readConfig = async (): Promise<Record<string, string>> => {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);
    if (config.apiKey && safeStorage.isEncryptionAvailable()) {
      config.apiKey = safeStorage.decryptString(Buffer.from(config.apiKey, "base64"));
    }
    return config;
  } catch {
    return {};
  }
};

const writeConfig = async (data: Record<string, string>) => {
  const toSave = { ...data };
  if (toSave.apiKey && safeStorage.isEncryptionAvailable()) {
    toSave.apiKey = safeStorage.encryptString(toSave.apiKey).toString("base64");
  }
  await fs.writeFile(CONFIG_PATH, JSON.stringify(toSave), "utf-8");
};

const writeServerConfig = async (config: Record<string, any>) => {
  await fs.writeFile(
    SERVER_CONFIG_PATH,
    JSON.stringify(
      {
        apiKey: config.apiKey ?? "",
        model: config.model ?? "",
        instructions: config.instructions ?? "",
      },
      null,
      2,
    ),
    "utf-8",
  );
};

let serverProcess: ChildProcess | null = null;

const startServer = async (config: Record<string, string>) => {
  await writeServerConfig(config);
  await new Promise<void>((resolve, reject) => {
    serverProcess = fork(path.join(__dirname, "server.cjs"), [], {
      stdio: "inherit",
      env: {
        ...process.env,
        SERVER_CONFIG_PATH,
        PORT: "3000",
      },
    });
    serverProcess.once("message", (msg) => {
      if (msg === "ready") resolve();
    });
    serverProcess.once("error", reject);
    setTimeout(resolve, 3000);
  });
};

const DEV_SERVER_URL = env.CORS_ORIGIN;
const isDev = !app.isPackaged;

const appIcon = nativeImage.createFromPath(
  path.join(__dirname, "..", "assets", "icons", "png", "256x256.png"),
);

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    frame: false,
    fullscreen: true,
    alwaysOnTop: true,
    focusable: true,
    transparent: true,
    skipTaskbar: true,
    hasShadow: false,
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
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

  let config = await readConfig();

  ipcMain.handle("get-config", async () => {
    const c = await readConfig();
    return {
      apiKey: c.apiKey ?? "",
      model: c.model ?? "",
      instructions: c.instructions ?? "",
      alwaysOnTop: c.alwaysOnTop !== "false",
    };
  });

  ipcMain.handle(
    "save-config",
    async (
      _,
      cfg: { apiKey: string; model: string; instructions: string; alwaysOnTop: boolean },
    ) => {
      const { alwaysOnTop, ...rest } = cfg;
      await writeConfig({ ...rest, alwaysOnTop: String(alwaysOnTop) });
      if (!isDev) await writeServerConfig(cfg);

      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.setAlwaysOnTop(alwaysOnTop, "screen-saver");
      }
    },
  );

  if (!isDev) await startServer(config);

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
