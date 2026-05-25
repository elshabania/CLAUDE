// Electron main process. Serves the Next.js static export (`out/`) over a
// localhost HTTP server so absolute /_next asset paths and fetch('/file.pdf')
// both resolve, then loads it in a BrowserWindow. No external server, no
// network access required - everything runs on the user's machine.

const { app, BrowserWindow, shell, Menu, ipcMain, dialog } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const isDev = !app.isPackaged;

// In production the exported site is unpacked next to the app resources.
// In dev we point at the repo's ./out folder.
function siteRoot() {
  if (isDev) return path.join(__dirname, "..", "out");
  return path.join(process.resourcesPath, "out");
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function startStaticServer(root) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        let rel = urlPath === "/" ? "/index.html" : urlPath;
        let filePath = path.join(root, rel);

        // Prevent path traversal outside the site root.
        if (!filePath.startsWith(root)) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }

        // Next static export: a route like /foo is emitted as /foo.html.
        if (!fs.existsSync(filePath)) {
          if (fs.existsSync(filePath + ".html")) {
            filePath += ".html";
          } else if (fs.existsSync(path.join(filePath, "index.html"))) {
            filePath = path.join(filePath, "index.html");
          } else {
            // SPA-style fallback to the root document.
            filePath = path.join(root, "index.html");
          }
        }

        const ext = path.extname(filePath).toLowerCase();
        const body = fs.readFileSync(filePath);
        res.writeHead(200, {
          "Content-Type": MIME[ext] || "application/octet-stream",
          "Content-Length": body.length,
        });
        res.end(body);
      } catch (err) {
        res.writeHead(500);
        res.end("Internal error: " + (err && err.message));
      }
    });
    server.on("error", reject);
    // Bind to loopback on an OS-assigned free port.
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

let mainWindow = null;

async function createWindow() {
  const root = siteRoot();
  if (!fs.existsSync(path.join(root, "index.html"))) {
    // Surface a clear error rather than a blank window.
    const win = new BrowserWindow({ width: 800, height: 600 });
    win.loadURL(
      "data:text/html," +
        encodeURIComponent(
          `<h2>Build assets missing</h2><p>Expected exported site at:<br><code>${root}</code></p>`
        )
    );
    return;
  }

  const baseUrl = await startStaticServer(root);

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#0f172a",
    title: "Masterplan Highway Analyzer",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Required so pdfjs can use WASM / workers from the local server.
      sandbox: false,
    },
  });

  // Open external links in the OS browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1")) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.loadURL(baseUrl);

  if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Send a command to the renderer; the React app listens via `desktop.onMenu`.
function send(command) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("menu", command);
  }
}

// Native file dialogs, driven over IPC from the renderer.
function registerIpc() {
  ipcMain.handle("open-drawing", async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: "Open Drawing",
      properties: ["openFile"],
      filters: [
        { name: "Drawings", extensions: ["pdf", "dxf"] },
        { name: "PDF", extensions: ["pdf"] },
        { name: "DXF", extensions: ["dxf"] },
      ],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    return { name: path.basename(p), data: new Uint8Array(fs.readFileSync(p)) };
  });

  ipcMain.handle("open-project", async () => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: "Open Project",
      properties: ["openFile"],
      filters: [{ name: "Analyzer Project", extensions: ["mhp", "json"] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    return { name: path.basename(p), text: fs.readFileSync(p, "utf8") };
  });

  ipcMain.handle("save-text", async (_e, { defaultName, text, filterName, ext }) => {
    const r = await dialog.showSaveDialog(mainWindow, {
      title: "Save",
      defaultPath: defaultName,
      filters: [{ name: filterName, extensions: [ext] }],
    });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, text, "utf8");
    return true;
  });

  ipcMain.handle("save-binary", async (_e, { defaultName, data, filterName, ext }) => {
    const r = await dialog.showSaveDialog(mainWindow, {
      title: "Export",
      defaultPath: defaultName,
      filters: [{ name: filterName, extensions: [ext] }],
    });
    if (r.canceled || !r.filePath) return false;
    fs.writeFileSync(r.filePath, Buffer.from(data));
    return true;
  });
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    {
      label: "File",
      submenu: [
        { label: "Open Drawing…", accelerator: "CmdOrCtrl+O", click: () => send("open-drawing") },
        { label: "Open Project…", accelerator: "CmdOrCtrl+Shift+O", click: () => send("open-project") },
        { type: "separator" },
        { label: "Save Project…", accelerator: "CmdOrCtrl+S", click: () => send("save-project") },
        { type: "separator" },
        {
          label: "Export",
          submenu: [
            { label: "Junction LOS Results (CSV)…", click: () => send("export-csv") },
            { label: "Highway Dimensions (CSV)…", click: () => send("export-dims-csv") },
            { label: "Current View (PNG)…", click: () => send("export-png") },
          ],
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { label: "Undo", accelerator: "CmdOrCtrl+Z", click: () => send("undo") },
        { label: "Redo", accelerator: "CmdOrCtrl+Shift+Z", click: () => send("redo") },
        { type: "separator" },
        { role: "copy" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Drawing", accelerator: "CmdOrCtrl+1", click: () => send("tab:drawing") },
        { label: "Highway Plan", accelerator: "CmdOrCtrl+2", click: () => send("tab:highway") },
        { label: "Network 3D", accelerator: "CmdOrCtrl+3", click: () => send("tab:network") },
        { label: "Movements", accelerator: "CmdOrCtrl+4", click: () => send("tab:movements") },
        { label: "Phasing", accelerator: "CmdOrCtrl+5", click: () => send("tab:phasing") },
        { label: "AI Optimiser", accelerator: "CmdOrCtrl+6", click: () => send("tab:ai") },
        { type: "separator" },
        { label: "Zoom to Fit", accelerator: "CmdOrCtrl+0", click: () => send("zoom-fit") },
        { label: "Zoom In", accelerator: "CmdOrCtrl+Plus", click: () => send("zoom-in") },
        { label: "Zoom Out", accelerator: "CmdOrCtrl+-", click: () => send("zoom-out") },
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { role: "togglefullscreen" },
      ],
    },
    {
      role: "help",
      submenu: [
        {
          label: "About Masterplan Highway Analyzer",
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: "info",
              title: "About",
              message: "Masterplan Highway Analyzer",
              detail:
                "Desktop tool for extracting road networks from masterplan " +
                "drawings and running HCM junction & highway capacity analysis.\n\n" +
                "Runs fully offline on your machine.",
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  registerIpc();
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
