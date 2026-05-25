// Preload runs in an isolated context before the renderer loads. It exposes a
// small, explicit bridge so the React app can drive native file dialogs and
// respond to application-menu commands without nodeIntegration.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isElectron: true,
  platform: process.platform,

  // Subscribe to application-menu commands. Returns an unsubscribe fn.
  onMenu(callback) {
    const handler = (_e, command) => callback(command);
    ipcRenderer.on("menu", handler);
    return () => ipcRenderer.removeListener("menu", handler);
  },

  // Native dialogs (resolve to null/false when the user cancels).
  openDrawing: () => ipcRenderer.invoke("open-drawing"),
  openProject: () => ipcRenderer.invoke("open-project"),
  saveProject: (defaultName, text) =>
    ipcRenderer.invoke("save-text", {
      defaultName,
      text,
      filterName: "Analyzer Project",
      ext: "mhp",
    }),
  saveText: (defaultName, text, filterName, ext) =>
    ipcRenderer.invoke("save-text", { defaultName, text, filterName, ext }),
  saveBinary: (defaultName, data, filterName, ext) =>
    ipcRenderer.invoke("save-binary", { defaultName, data, filterName, ext }),
});
