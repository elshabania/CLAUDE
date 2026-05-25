// Preload runs in an isolated context before the renderer loads. The app is
// fully client-side and needs no privileged bridge today; we expose a tiny,
// read-only marker so the renderer can detect it's running inside the desktop
// shell (e.g. to tweak copy that says "app" vs "site").
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isElectron: true,
  platform: process.platform,
});
