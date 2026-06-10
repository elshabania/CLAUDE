"use client";

// Save/open that works both in the Electron desktop shell (native dialogs)
// and in a plain browser (download / file-input fallback).

export function isDesktop(): boolean {
  return typeof window !== "undefined" && !!window.desktop?.isElectron;
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Save UTF-8 text. Returns true if a file was written (false if cancelled). */
export async function saveText(
  defaultName: string,
  text: string,
  filterName: string,
  ext: string
): Promise<boolean> {
  if (isDesktop()) {
    return window.desktop!.saveText(defaultName, text, filterName, ext);
  }
  downloadBlob(defaultName, new Blob([text], { type: "text/plain" }));
  return true;
}

/** Save binary data (e.g. a PNG). */
export async function saveBinary(
  defaultName: string,
  data: ArrayBuffer,
  filterName: string,
  ext: string,
  mime: string
): Promise<boolean> {
  if (isDesktop()) {
    return window.desktop!.saveBinary(defaultName, data, filterName, ext);
  }
  downloadBlob(defaultName, new Blob([data], { type: mime }));
  return true;
}

/** Open a drawing (PDF/DXF) and return it as a File, or null if cancelled. */
export async function openDrawing(): Promise<File | null> {
  if (isDesktop()) {
    const r = await window.desktop!.openDrawing();
    if (!r) return null;
    return new File([new Uint8Array(r.data)], r.name);
  }
  return pickFile(".pdf,.dxf,.dwg");
}

/** Open a project file and return its text, or null if cancelled. */
export async function openProjectText(): Promise<string | null> {
  if (isDesktop()) {
    const r = await window.desktop!.openProject();
    return r ? r.text : null;
  }
  const file = await pickFile(".mhp,.json");
  return file ? file.text() : null;
}

/** Browser fallback: a transient <input type=file> resolved by the dialog. */
function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    let settled = false;
    input.onchange = () => {
      settled = true;
      resolve(input.files?.[0] ?? null);
      input.remove();
    };
    // If the dialog is dismissed, resolve null on the next focus.
    window.addEventListener(
      "focus",
      () => setTimeout(() => !settled && resolve(null), 500),
      { once: true }
    );
    document.body.appendChild(input);
    input.click();
  });
}
