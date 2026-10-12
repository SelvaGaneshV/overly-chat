import { env } from "@overly-chat/env/desktop";
import {
  app,
  BrowserWindow,
  desktopCapturer,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  safeStorage,
  screen,
  Tray,
} from "electron";
import { exec, fork, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const sessionToken = crypto.randomUUID();
let serverPort = env.PORT;

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

const readConfig = async (): Promise<Record<string, string>> => {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);
    if (config.apiKey && safeStorage.isEncryptionAvailable()) {
      try {
        const decrypted = safeStorage.decryptString(Buffer.from(config.apiKey, "base64"));
        if (decrypted) config.apiKey = decrypted;
      } catch {
        // Already plaintext, keep config.apiKey
      }
    }
    return config;
  } catch {
    return {};
  }
};

const writeConfig = async (data: Record<string, string>) => {
  const toSave = { ...data };
  await fs.writeFile(CONFIG_PATH, JSON.stringify(toSave, null, 2), "utf-8");
};

let serverProcess: ChildProcess | null = null;

const syncConfigToServer = async (config: Record<string, any>) => {
  const payload = {
    apiKey: config.apiKey ?? "",
    model: config.model ?? "",
    instructions: config.instructions ?? "",
    persona: config.persona ?? "",
    workingDir: config.workingDir ?? "",
  };

  // 1. Send via in-memory IPC pipe to child process (when forked)
  if (serverProcess?.send) {
    try {
      serverProcess.send({ type: "SET_CONFIG", config: payload });
    } catch (err) {
      console.warn("Failed to send config over IPC pipe:", err);
    }
  }

  // 2. Also sync to in-memory endpoint on localhost (handles standalone dev server)
  try {
    await fetch(`http://127.0.0.1:${serverPort}/internal/config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Server may still be starting up, harmless
  }
};

const startServer = async (config: Record<string, string>) => {
  await new Promise<void>((resolve, reject) => {
    // In production or desktop packaging, bind to dynamic port 0 for zero collisions
    const portToUse = isDev && process.env.OVERLY_FIXED_PORT ? String(env.PORT) : "0";

    serverProcess = fork(path.join(__dirname, "server.cjs"), [], {
      stdio: "inherit",
      env: {
        ...process.env,
        PORT: portToUse,
        HOST: "127.0.0.1",
        OVERLY_SESSION_TOKEN: sessionToken,
      },
    });

    const onReady = (assignedPort?: number) => {
      if (assignedPort) {
        serverPort = assignedPort;
      }
      syncConfigToServer(config);
      resolve();
    };

    serverProcess.on("message", (msg) => {
      if (msg && typeof msg === "object" && (msg as { type?: string }).type === "ready") {
        const p = (msg as { port?: number }).port;
        onReady(p);
      } else if (msg === "ready") {
        onReady();
      }
    });

    serverProcess.once("error", reject);
    setTimeout(() => {
      syncConfigToServer(config);
      resolve();
    }, 3000);
  });
};

const DEV_SERVER_URL = env.CORS_ORIGIN;
const isDev = !app.isPackaged;

const appIcon = nativeImage.createFromPath(
  path.join(__dirname, "..", "assets", "icons", "png", "256x256.png"),
);

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 720;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 200;
const SNAP_THRESHOLD = 15;
const EDGE_MARGIN = 12;
const BUBBLE_SIZE = 64;

type WindowBounds = { x: number; y: number; width: number; height: number };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

const parseWindowBounds = (raw: unknown): WindowBounds | null => {
  if (typeof raw !== "string") return null;
  try {
    const b = JSON.parse(raw) as Partial<WindowBounds>;
    if (
      typeof b.x !== "number" ||
      typeof b.y !== "number" ||
      typeof b.width !== "number" ||
      typeof b.height !== "number" ||
      !Number.isFinite(b.x) ||
      !Number.isFinite(b.y) ||
      !Number.isFinite(b.width) ||
      !Number.isFinite(b.height)
    ) {
      return null;
    }
    return {
      x: Math.round(b.x),
      y: Math.round(b.y),
      width: clamp(Math.round(b.width), MIN_WIDTH, 4000),
      height: clamp(Math.round(b.height), MIN_HEIGHT, 4000),
    };
  } catch {
    return null;
  }
};

let mainWindow: BrowserWindow | null = null;
let isBubble = false;
let isGhostMode = false;
let expandedBounds: WindowBounds | null = null;
let tray: Tray | null = null;

const setGhostMode = (enabled: boolean) => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isGhostMode = enabled;
  if (enabled) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  } else {
    mainWindow.setIgnoreMouseEvents(false);
  }
  mainWindow.webContents.send("ghost-mode-changed", enabled);
};

const triggerMinimizeToBubble = () => {
  if (!mainWindow || mainWindow.isDestroyed() || isBubble) return;
  const current = mainWindow.getBounds();
  expandedBounds = current;
  persistBounds(current);
  const display = screen.getDisplayMatching(current);
  const area = display.workArea;
  const bx = clamp(
    current.x + current.width - BUBBLE_SIZE,
    area.x,
    area.x + area.width - BUBBLE_SIZE,
  );
  const by = clamp(current.y, area.y, area.y + area.height - BUBBLE_SIZE);
  isBubble = true;
  mainWindow.setBounds({ x: bx, y: by, width: BUBBLE_SIZE, height: BUBBLE_SIZE });
};

const triggerExpandFromBubble = () => {
  if (!mainWindow || mainWindow.isDestroyed() || !isBubble) return;
  isBubble = false;
  const bounds = expandedBounds ?? {
    x: 0,
    y: 0,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  };
  const display = screen.getDisplayMatching(bounds);
  const area = display.workArea;
  const width = clamp(bounds.width, MIN_WIDTH, area.width);
  const height = clamp(bounds.height, MIN_HEIGHT, area.height);
  const nx = clamp(bounds.x, area.x - width + 80, area.x + area.width - 80);
  const ny = clamp(bounds.y, area.y - height + 80, area.y + area.height - 80);
  mainWindow.setBounds({ x: nx, y: ny, width, height });
  persistBounds({ x: nx, y: ny, width, height });
};

let persistTimer: NodeJS.Timeout | null = null;
const persistBounds = (bounds?: WindowBounds) => {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (isBubble && !bounds) return;
    const b = bounds ?? mainWindow.getBounds();
    const config = await readConfig();
    await writeConfig({ ...config, windowBounds: JSON.stringify(b) });
  }, 500);
};

const snapBounds = (b: WindowBounds): WindowBounds => {
  const display = screen.getDisplayMatching(b);
  const area = display.workArea;
  let nx = b.x;
  let ny = b.y;
  if (Math.abs(nx - area.x) <= SNAP_THRESHOLD) {
    nx = area.x;
  } else if (Math.abs(nx + b.width - (area.x + area.width)) <= SNAP_THRESHOLD) {
    nx = area.x + area.width - b.width;
  }
  if (Math.abs(ny - area.y) <= SNAP_THRESHOLD) {
    ny = area.y;
  } else if (Math.abs(ny + b.height - (area.y + area.height)) <= SNAP_THRESHOLD) {
    ny = area.y + area.height - b.height;
  }
  return { ...b, x: nx, y: ny };
};

const createTray = () => {
  if (tray) return;
  try {
    tray = new Tray(appIcon);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Show Overly",
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) return;
          if (isBubble) triggerExpandFromBubble();
          mainWindow.show();
          mainWindow.focus();
        },
      },
      {
        label: "Toggle Bubble",
        click: () => {
          if (!mainWindow || mainWindow.isDestroyed()) return;
          if (isBubble) mainWindow.webContents.send("request-expand");
          else mainWindow.webContents.send("request-minimize");
        },
      },
      {
        label: "Toggle Ghost Mode (Ctrl+Shift+P)",
        click: () => {
          setGhostMode(!isGhostMode);
        },
      },
      { type: "separator" },
      {
        label: "Quit Overly",
        click: () => {
          app.quit();
        },
      },
    ]);
    tray.setToolTip("Overly Chat");
    tray.setContextMenu(contextMenu);
    tray.on("click", () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    });
  } catch (err) {
    console.warn("Failed to create tray icon:", err);
  }
};

const createWindow = async () => {
  const cfg = await readConfig();
  const saved = parseWindowBounds(cfg.windowBounds);

  let anchorDisplay;
  try {
    anchorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  } catch {
    anchorDisplay = screen.getPrimaryDisplay();
  }
  const wa = anchorDisplay.workArea;

  const width = clamp(saved?.width ?? DEFAULT_WIDTH, MIN_WIDTH, wa.width);
  const height = clamp(saved?.height ?? DEFAULT_HEIGHT, MIN_HEIGHT, wa.height);

  let x: number;
  let y: number;
  if (saved) {
    x = clamp(saved.x, wa.x - width + 80, wa.x + wa.width - 80);
    y = clamp(saved.y, wa.y - height + 80, wa.y + wa.height - 80);
  } else {
    x = wa.x + wa.width - width - EDGE_MARGIN;
    y = wa.y + Math.round((wa.height - height) / 2);
  }

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    resizable: false,
    movable: true,
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

  mainWindow.setAlwaysOnTop(cfg.alwaysOnTop !== "false", "screen-saver");
  mainWindow.setContentProtection(true);

  const initialOpacity = Number(cfg.opacity ?? 0.96);
  if (Number.isFinite(initialOpacity) && initialOpacity >= 0.2 && initialOpacity <= 1.0) {
    mainWindow.setOpacity(initialOpacity);
  }

  let snapping = false;
  let moveTimer: NodeJS.Timeout | null = null;
  mainWindow.on("move", () => {
    if (!mainWindow || snapping || mainWindow.isDestroyed()) return;
    persistBounds();
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (!mainWindow || snapping || mainWindow.isDestroyed()) return;
      const current = mainWindow.getBounds();
      const display = screen.getDisplayMatching(current);
      const area = display.workArea;
      const snapped = snapBounds(current);
      const minVisible = isBubble ? current.width : 80;
      const nx = clamp(
        snapped.x,
        area.x - current.width + minVisible,
        area.x + area.width - minVisible,
      );
      const ny = clamp(
        snapped.y,
        area.y - current.height + minVisible,
        area.y + area.height - minVisible,
      );
      if (nx !== current.x || ny !== current.y) {
        mainWindow.setBounds({ ...current, x: nx, y: ny });
        persistBounds();
      }
    }, 250);
  });

  let lastResizeLog = 0;

  ipcMain.on("close-window", () => {
    mainWindow?.close();
  });

  ipcMain.on("minimize-to-bubble", () => {
    triggerMinimizeToBubble();
  });

  ipcMain.on("expand-from-bubble", () => {
    triggerExpandFromBubble();
  });

  ipcMain.on("set-ghost-mode", (_, enabled: boolean) => {
    setGhostMode(enabled);
  });

  ipcMain.handle("capture-screen", async () => {
    try {
      const cursor = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursor);
      const { width: dw, height: dh } = display.size;
      const sources = await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: {
          width: Math.round(dw * display.scaleFactor),
          height: Math.round(dh * display.scaleFactor),
        },
      });
      if (!sources || sources.length === 0) return null;
      const match = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
      return match.thumbnail.toDataURL();
    } catch (err) {
      console.error("[capture-screen] error:", err);
      return null;
    }
  });

  ipcMain.handle("get-open-windows", async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["window"],
        thumbnailSize: { width: 480, height: 270 },
        fetchWindowIcons: true,
      });

      return sources
        .filter((s) => {
          const name = s.name.trim();
          return (
            name.length > 0 &&
            name !== "Overly" &&
            !name.toLowerCase().includes("overly-chat") &&
            !name.toLowerCase().includes("overly chat")
          );
        })
        .map((s) => ({
          id: s.id,
          name: s.name,
          thumbnail: s.thumbnail.toDataURL(),
          appIcon: s.appIcon?.toDataURL() || undefined,
        }));
    } catch (err) {
      console.error("[get-open-windows] error:", err);
      return [];
    }
  });

  ipcMain.handle("capture-window", async (_, windowId: string) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ["window"],
        thumbnailSize: { width: 1920, height: 1080 },
      });
      const match = sources.find((s) => s.id === windowId || s.name === windowId);
      if (!match) return null;
      return match.thumbnail.toDataURL();
    } catch (err) {
      console.error("[capture-window] error:", err);
      return null;
    }
  });

  ipcMain.handle("exec-command", async (_, { command, cwd }: { command: string; cwd?: string }) => {
    let resolvedCwd = os.homedir();
    if (cwd) {
      try {
        await fs.access(cwd);
        resolvedCwd = cwd;
      } catch {
        // Fall back to home if path doesn't exist
      }
    }
    return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      const proc = exec(
        command,
        {
          cwd: resolvedCwd,
          timeout: 30_000,
          shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh",
        },
        (err, stdout, stderr) => {
          resolve({
            stdout: stdout.slice(0, 20_000),
            stderr: stderr.slice(0, 5_000),
            exitCode: typeof err?.code === "number" ? err.code : err ? 1 : 0,
          });
        },
      );
      proc.on("error", (err) => {
        resolve({ stdout: "", stderr: err.message, exitCode: 1 });
      });
    });
  });

  ipcMain.on("resize-chat-window", (_, size: { width: number; height: number }) => {
    if (!mainWindow || mainWindow.isDestroyed() || isBubble) return;
    const reqW = Number(size?.width);
    const reqH = Number(size?.height);
    if (!Number.isFinite(reqW) || !Number.isFinite(reqH)) return;

    const current = mainWindow.getBounds();
    const display = screen.getDisplayMatching(current);
    const area = display.workArea;
    const nextWidth = clamp(Math.round(reqW), MIN_WIDTH, area.width);
    const nextHeight = clamp(Math.round(reqH), MIN_HEIGHT, area.height);

    const dockedRight =
      Math.abs(current.x + current.width - (area.x + area.width)) <= SNAP_THRESHOLD;
    const dockedBottom =
      Math.abs(current.y + current.height - (area.y + area.height)) <= SNAP_THRESHOLD;
    let nx = current.x;
    let ny = current.y;
    if (dockedRight) nx = area.x + area.width - nextWidth;
    if (dockedBottom) ny = area.y + area.height - nextHeight;
    nx = clamp(nx, area.x - nextWidth + 80, area.x + area.width - 80);
    ny = clamp(ny, area.y - nextHeight + 80, area.y + area.height - 80);

    const now = Date.now();
    if (now - lastResizeLog > 500) {
      lastResizeLog = now;
    }
    snapping = true;
    mainWindow.setBounds({ x: nx, y: ny, width: nextWidth, height: nextHeight });
    snapping = false;
  });

  ipcMain.on("resize-chat-window-end", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const current = mainWindow.getBounds();
    const snapped = snapBounds(current);
    if (snapped.x !== current.x || snapped.y !== current.y) {
      mainWindow.setBounds(snapped);
    }
    persistBounds();
  });

  ipcMain.on("snap-window", (_, position: string) => {
    if (!mainWindow || mainWindow.isDestroyed() || isBubble) return;
    const current = mainWindow.getBounds();
    const display = screen.getDisplayMatching(current);
    const area = display.workArea;

    const isCurrentlyMaximized =
      Math.abs(current.x - area.x) <= 2 &&
      Math.abs(current.y - area.y) <= 2 &&
      Math.abs(current.width - area.width) <= 4 &&
      Math.abs(current.height - area.height) <= 4;

    if (!isCurrentlyMaximized && position === "maximize") {
      expandedBounds = current;
    }

    let nextBounds: WindowBounds;
    const SIDEBAR_WIDTH = Math.min(460, Math.max(380, Math.round(area.width * 0.32)));
    const HALF_WIDTH = Math.round(area.width / 2);
    const HALF_HEIGHT = Math.round(area.height / 2);

    switch (position) {
      case "right-sidebar":
        nextBounds = {
          x: area.x + area.width - SIDEBAR_WIDTH,
          y: area.y,
          width: SIDEBAR_WIDTH,
          height: area.height,
        };
        break;
      case "left-sidebar":
        nextBounds = {
          x: area.x,
          y: area.y,
          width: SIDEBAR_WIDTH,
          height: area.height,
        };
        break;
      case "left-half":
        nextBounds = {
          x: area.x,
          y: area.y,
          width: HALF_WIDTH,
          height: area.height,
        };
        break;
      case "right-half":
        nextBounds = {
          x: area.x + area.width - HALF_WIDTH,
          y: area.y,
          width: HALF_WIDTH,
          height: area.height,
        };
        break;
      case "top-left":
        nextBounds = {
          x: area.x,
          y: area.y,
          width: HALF_WIDTH,
          height: HALF_HEIGHT,
        };
        break;
      case "top-right":
        nextBounds = {
          x: area.x + area.width - HALF_WIDTH,
          y: area.y,
          width: HALF_WIDTH,
          height: HALF_HEIGHT,
        };
        break;
      case "bottom-left":
        nextBounds = {
          x: area.x,
          y: area.y + area.height - HALF_HEIGHT,
          width: HALF_WIDTH,
          height: HALF_HEIGHT,
        };
        break;
      case "bottom-right":
        nextBounds = {
          x: area.x + area.width - HALF_WIDTH,
          y: area.y + area.height - HALF_HEIGHT,
          width: HALF_WIDTH,
          height: HALF_HEIGHT,
        };
        break;
      case "center":
        nextBounds = {
          x: area.x + Math.round((area.width - DEFAULT_WIDTH) / 2),
          y: area.y + Math.round((area.height - DEFAULT_HEIGHT) / 2),
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT,
        };
        break;
      case "maximize":
        if (isCurrentlyMaximized && expandedBounds) {
          nextBounds = expandedBounds;
        } else {
          nextBounds = {
            x: area.x,
            y: area.y,
            width: area.width,
            height: area.height,
          };
        }
        break;
      case "restore":
      default:
        nextBounds = expandedBounds ?? {
          x: area.x + area.width - DEFAULT_WIDTH - EDGE_MARGIN,
          y: area.y + Math.round((area.height - DEFAULT_HEIGHT) / 2),
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT,
        };
        break;
    }

    snapping = true;
    mainWindow.setBounds(nextBounds);
    snapping = false;
    persistBounds(nextBounds);
  });

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  }
};

app.on("ready", async () => {
  if (process.platform === "win32") app.setAppUserModelId("Overly");

  const config = await readConfig();
  if (config.apiKey) {
    await writeConfig(config);
  }

  if (!isDev) {
    await startServer(config);
  } else {
    // In dev mode, sync config to local dev server in memory
    syncConfigToServer(config);
  }

  ipcMain.handle("get-server-info", () => {
    return {
      port: serverPort,
      url: `http://127.0.0.1:${serverPort}`,
      token: sessionToken,
    };
  });

  ipcMain.handle("get-config", async () => {
    const c = await readConfig();
    return {
      apiKey: c.apiKey ?? "",
      model: c.model ?? "",
      instructions: c.instructions ?? "",
      persona: c.persona ?? "general",
      alwaysOnTop: c.alwaysOnTop !== "false",
      opacity: c.opacity ? Number(c.opacity) : 0.96,
      workingDir: c.workingDir ?? "",
    };
  });

  ipcMain.handle(
    "save-config",
    async (
      _,
      cfg: {
        apiKey: string;
        model: string;
        instructions: string;
        persona?: string;
        alwaysOnTop: boolean;
        opacity?: number;
        workingDir?: string;
      },
    ) => {
      const { alwaysOnTop, opacity, workingDir, ...rest } = cfg;
      await writeConfig({
        ...rest,
        alwaysOnTop: String(alwaysOnTop),
        opacity: String(opacity ?? 0.96),
        ...(workingDir !== undefined ? { workingDir } : {}),
      });
      await syncConfigToServer(cfg);

      const win = mainWindow ?? BrowserWindow.getAllWindows()[0];
      if (win) {
        win.setAlwaysOnTop(alwaysOnTop, "screen-saver");
        if (typeof opacity === "number" && opacity >= 0.2 && opacity <= 1.0) {
          win.setOpacity(opacity);
        }
        win.webContents.send("config-changed", cfg);
      }
    },
  );

  await createWindow();
  createTray();

  // Global shortcuts
  globalShortcut.register("CommandOrControl+Q", () => app.quit());
  globalShortcut.register("CommandOrControl+Shift+I", () => {
    mainWindow?.webContents.toggleDevTools();
  });

  // Global summon hotkey: Ctrl+Shift+Space
  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (isGhostMode) {
      setGhostMode(false);
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    } else if (mainWindow.isFocused()) {
      if (!isBubble) {
        mainWindow.webContents.send("request-minimize");
      } else {
        mainWindow.webContents.send("request-expand");
      }
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Ghost Mode hotkey: Ctrl+Shift+P
  globalShortcut.register("CommandOrControl+Shift+P", () => {
    setGhostMode(!isGhostMode);
  });
});

app.on("window-all-closed", () => {
  serverProcess?.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
