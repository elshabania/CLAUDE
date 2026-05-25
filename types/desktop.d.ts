// Bridge exposed by electron/preload.js. Undefined when running in a plain
// browser (the app falls back to download/upload there).
export interface DesktopBridge {
  isElectron: true;
  platform: string;
  onMenu(callback: (command: string) => void): () => void;
  openDrawing(): Promise<{ name: string; data: Uint8Array } | null>;
  openProject(): Promise<{ name: string; text: string } | null>;
  saveProject(defaultName: string, text: string): Promise<boolean>;
  saveText(
    defaultName: string,
    text: string,
    filterName: string,
    ext: string
  ): Promise<boolean>;
  saveBinary(
    defaultName: string,
    data: ArrayBuffer,
    filterName: string,
    ext: string
  ): Promise<boolean>;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
  }
}

export {};
