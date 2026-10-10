import { env } from "@overly-chat/env/desktop";
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  nativeImage,
  safeStorage,
  screen,
} from "electron";
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

const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 700;
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

const createWindow = async () => {
  const saved = parseWindowBounds((await readConfig()).windowBounds);

  // Place on the display nearest the cursor so multi-monitor setups
  // open the panel where the user is working.
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
    // Restore last position, clamped so at least a corner stays visible
    // on the anchor display (display layout may have changed).
    x = clamp(saved.x, wa.x - width + 80, wa.x + wa.width - 80);
    y = clamp(saved.y, wa.y - height + 80, wa.y + wa.height - 80);
  } else {
    // First launch: docked to the right edge, vertically centered.
    x = wa.x + wa.width - width - EDGE_MARGIN;
    y = wa.y + Math.round((wa.height - height) / 2);
  }

  const mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    resizable: false, // custom in-app grip keeps the OS resize cursor away
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

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setContentProtection(true);

  // Bubble (minimized) mode: 64px circle. The expanded bounds are kept in
  // memory and persisted so relaunch always restores the full panel.
  let isBubble = false;
  let expandedBounds: WindowBounds | null = null;

  let snapping = false;
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

  let persistTimer: NodeJS.Timeout | null = null;
  const persistBounds = (bounds?: WindowBounds) => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(async () => {
      if (mainWindow.isDestroyed()) return;
      // Never persist the bubble footprint over the real panel bounds.
      if (isBubble && !bounds) return;
      const b = bounds ?? mainWindow.getBounds();
      const config = await readConfig();
      await writeConfig({ ...config, windowBounds: JSON.stringify(b) });
    }, 500);
  };

  // Snap on release, never mid-drag: mutating the window inside an
  // active OS drag causes jumps/fights with the drag operation.
  let moveTimer: NodeJS.Timeout | null = null;
  mainWindow.on("move", () => {
    if (snapping || mainWindow.isDestroyed()) return;
    persistBounds();
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (snapping || mainWindow.isDestroyed()) return;
      const current = mainWindow.getBounds();
      console.log(
        `[move-release] ${current.width}x${current.height} at (${current.x},${current.y})`,
      );
      const display = screen.getDisplayMatching(current);
      const area = display.workArea;
      const snapped = snapBounds(current);
      // Keep the window reachable: the panel keeps an 80px strip visible,
      // the bubble stays fully on-screen (native drags are unclamped).
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
        console.log(`[snap] (${current.x},${current.y}) -> (${nx},${ny})`);
        // setBounds (not setPosition): position-only updates accumulate a
        // size drift on transparent Windows builds, so always re-assert
        // the current size.
        mainWindow.setBounds({ ...current, x: nx, y: ny });
        persistBounds();
      }
    }, 250);
  });

  let lastResizeLog = 0;

  ipcMain.on("close-window", () => {
    mainWindow.close();
  });

  ipcMain.on("minimize-to-bubble", () => {
    if (mainWindow.isDestroyed() || isBubble) return;
    const current = mainWindow.getBounds();
    expandedBounds = current;
    // Persist the panel footprint (not the bubble) so relaunch restores it.
    persistBounds(current);
    const display = screen.getDisplayMatching(current);
    const area = display.workArea;
    // Anchor the bubble to the panel's top-right corner.
    const bx = clamp(
      current.x + current.width - BUBBLE_SIZE,
      area.x,
      area.x + area.width - BUBBLE_SIZE,
    );
    const by = clamp(current.y, area.y, area.y + area.height - BUBBLE_SIZE);
    isBubble = true;
    console.log(`[bubble] minimize to ${BUBBLE_SIZE}x${BUBBLE_SIZE} at (${bx},${by})`);
    mainWindow.setBounds({ x: bx, y: by, width: BUBBLE_SIZE, height: BUBBLE_SIZE });
  });

  ipcMain.on("expand-from-bubble", () => {
    if (mainWindow.isDestroyed() || !isBubble) return;
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
    console.log(`[bubble] expand to ${width}x${height} at (${nx},${ny})`);
    mainWindow.setBounds({ x: nx, y: ny, width, height });
    persistBounds({ x: nx, y: ny, width, height });
  });

  ipcMain.on("resize-chat-window", (_, size: { width: number; height: number }) => {
    if (mainWindow.isDestroyed() || isBubble) return;
    const reqW = Number(size?.width);
    const reqH = Number(size?.height);
    if (!Number.isFinite(reqW) || !Number.isFinite(reqH)) {
      let raw = "?";
      try {
        raw = JSON.stringify(size) ?? "undefined";
      } catch {
        raw = "<unserializable>";
      }
      console.log(`[resize] dropped invalid size: ${raw}`);
      return;
    }
    const current = mainWindow.getBounds();
    const display = screen.getDisplayMatching(current);
    const area = display.workArea;
    const nextWidth = clamp(Math.round(reqW), MIN_WIDTH, area.width);
    const nextHeight = clamp(Math.round(reqH), MIN_HEIGHT, area.height);
    // Anchor-aware: a docked edge stays glued while growing/shrinking.
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
      console.log(
        `[resize] req=${Math.round(reqW)}x${Math.round(reqH)} applied=${nextWidth}x${nextHeight} pos=(${current.x},${current.y})->(${nx},${ny})`,
      );
    }
    snapping = true;
    mainWindow.setBounds({ x: nx, y: ny, width: nextWidth, height: nextHeight });
    snapping = false;
  });

  ipcMain.on("resize-chat-window-end", () => {
    if (mainWindow.isDestroyed()) return;
    const current = mainWindow.getBounds();
    console.log(`[resize-end] ${current.width}x${current.height} at (${current.x},${current.y})`);
    const snapped = snapBounds(current);
    if (snapped.x !== current.x || snapped.y !== current.y) {
      mainWindow.setBounds(snapped);
    }
    persistBounds();
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

  await createWindow();

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
  if (BrowserWindow.getAllWindows().length === 0) void createWindow();
});
