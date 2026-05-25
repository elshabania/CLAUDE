// Electron main process. Serves the Next.js static export (`out/`) over a
// localhost HTTP server so absolute /_next asset paths and fetch('/file.pdf')
// both resolve, then loads it in a BrowserWindow. No external server, no
// network access required - everything runs on the user's machine.

const { app, BrowserWindow, shell, Menu } = require("electron");
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

// Minimal application menu (keeps standard shortcuts: copy, zoom, devtools).
function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [{ role: "quit" }],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
