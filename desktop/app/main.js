// Sermon Brief desktop shell.
// Starts the bundled Next.js server with a bundled Node.js on a free local port,
// then shows it in an app window. All data lives in the user's AppData folder.

const { app, BrowserWindow, Menu, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const STARTUP_TIMEOUT_MS = 90_000;
const MAX_LOG_BYTES = 5 * 1024 * 1024;

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

const resources = process.resourcesPath;
const paths = {
  serverDir: path.join(resources, "server"),
  node: path.join(resources, "node", process.platform === "win32" ? "node.exe" : "node"),
  tessdataSeed: path.join(resources, "tessdata", "eng.traineddata"),
  dataDir: path.join(app.getPath("userData"), "data"),
  logFile: path.join(app.getPath("userData"), "logs", "server.log"),
};

let mainWindow = null;
let server = null;
let quitting = false;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function openLog() {
  fs.mkdirSync(path.dirname(paths.logFile), { recursive: true });
  try {
    if (fs.statSync(paths.logFile).size > MAX_LOG_BYTES) fs.renameSync(paths.logFile, `${paths.logFile}.old`);
  } catch {
    // no log yet
  }
  const fd = fs.openSync(paths.logFile, "a");
  fs.writeSync(fd, `\n--- ${new Date().toISOString()} starting Sermon Brief ${app.getVersion()} ---\n`);
  return fd;
}

/** Copy the bundled OCR model into the data folder on first run, so OCR works offline. */
function seedOcrModel() {
  const target = path.join(paths.dataDir, "tessdata", "eng.traineddata");
  if (fs.existsSync(target) || !fs.existsSync(paths.tessdataSeed)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(paths.tessdataSeed, target);
}

function startServer(port, logFd) {
  const child = spawn(paths.node, [path.join(paths.serverDir, "launcher.cjs")], {
    cwd: paths.serverDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1", // local only: never reachable from the network
      SERMON_BRIEF_DATA_DIR: paths.dataDir,
      SERMON_BRIEF_PARENT_PID: String(process.pid),
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_OPTIONS: "--disable-warning=ExperimentalWarning",
    },
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
  });
  child.on("exit", (code, signal) => {
    server = null;
    if (quitting) return;
    dialog.showErrorBox(
      "Sermon Brief stopped",
      `The app's background service stopped unexpectedly (${signal ?? `code ${code}`}).\n\n` +
        `Details are in:\n${paths.logFile}`,
    );
    app.quit();
  });
  return child;
}

function waitForServer(url) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (!server) return reject(new Error("The background service exited during startup."));
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else retry();
      });
      req.on("error", retry);
      req.setTimeout(5_000, () => req.destroy());
    };
    const retry = () => (Date.now() > deadline ? reject(new Error("Startup timed out.")) : setTimeout(attempt, 300));
    attempt();
  });
}

function createWindow(appUrl) {
  const origin = new URL(appUrl).origin;
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    title: "Sermon Brief",
    icon: path.join(__dirname, "icon.png"),
    backgroundColor: "#f6f6f3",
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });

  // Keep the window on the app; open anything else in the user's browser.
  const openOutside = (url) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  };
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (new URL(url).origin !== origin) {
      event.preventDefault();
      openOutside(url);
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => (mainWindow = null));
  mainWindow.loadURL(appUrl);
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: "appMenu" }] : []),
      { label: "File", submenu: [isMac ? { role: "close" } : { role: "quit" }] },
      { role: "editMenu" },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      {
        label: "Help",
        submenu: [
          { label: "Open data folder", click: () => shell.openPath(paths.dataDir) },
          { label: "Open log file", click: () => shell.openPath(paths.logFile) },
        ],
      },
    ]),
  );
}

function showSplash() {
  const splash = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: "#4b46d6",
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  splash.loadFile(path.join(__dirname, "loading.html"));
  splash.once("ready-to-show", () => splash.show());
  return splash;
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on("before-quit", () => {
  quitting = true;
  if (server) server.kill();
});

app.on("window-all-closed", () => app.quit());

app.whenReady().then(async () => {
  buildMenu();
  const splash = showSplash();
  try {
    fs.mkdirSync(paths.dataDir, { recursive: true });
    seedOcrModel();
    const port = await freePort();
    server = startServer(port, openLog());
    const appUrl = `http://127.0.0.1:${port}/`;
    await waitForServer(appUrl);
    createWindow(appUrl);
    mainWindow.once("ready-to-show", () => splash.destroy());
  } catch (err) {
    splash.destroy();
    dialog.showErrorBox(
      "Sermon Brief couldn't start",
      `${err instanceof Error ? err.message : String(err)}\n\nDetails are in:\n${paths.logFile}`,
    );
    app.quit();
  }
});
