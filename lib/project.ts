// Project document: the full, reopenable state of an analysis session. Saved
// as a .mhp file (JSON) so users can close the app and resume exactly where
// they left off - the parsed geometry, every classification correction, and
// all junction inputs travel with the file.

import type { ParsedDrawing, RoadCategory } from "@/lib/road-detect";
import type { JunctionInputs } from "@/lib/hcm";
import type { DimensionAssumptions } from "@/lib/highway-dims";

export const PROJECT_VERSION = 1;
export const PROJECT_MAGIC = "masterplan-highway-analyzer";

export interface ProjectDoc {
  magic: string;
  version: number;
  savedAt: string;
  filename: string | null;
  drawing: ParsedDrawing;
  groupCategory: Record<string, RoadCategory>;
  visibleCategories: Record<RoadCategory, boolean>;
  swatchOverrides: Partial<Record<RoadCategory, [number, number, number]>>;
  junctionInputs: Record<string, JunctionInputs>;
  dimAssumptions: DimensionAssumptions;
  pageRotation: number;
  colorBy: "los" | "class";
  selectedJunctionId: string | null;
}

export type ProjectState = Omit<ProjectDoc, "magic" | "version" | "savedAt">;

export function serializeProject(state: ProjectState): string {
  const doc: ProjectDoc = {
    magic: PROJECT_MAGIC,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    ...state,
  };
  return JSON.stringify(doc);
}

/** Parse + validate a .mhp file. Throws a user-readable error on bad input. */
export function parseProject(text: string): ProjectDoc {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new Error("This file isn't a valid project (not JSON).");
  }
  if (!doc || typeof doc !== "object") {
    throw new Error("This file isn't a valid project.");
  }
  const d = doc as Partial<ProjectDoc>;
  if (d.magic !== PROJECT_MAGIC) {
    throw new Error("This file isn't a Masterplan Highway Analyzer project.");
  }
  if (typeof d.version !== "number" || d.version > PROJECT_VERSION) {
    throw new Error(
      `This project was saved by a newer version (v${d.version}). Update the app to open it.`
    );
  }
  if (!d.drawing || !Array.isArray(d.drawing.segments)) {
    throw new Error("This project is missing its drawing data.");
  }
  return d as ProjectDoc;
}

/** Suggested filename for a project, derived from the source drawing name. */
export function projectFileName(sourceName: string | null): string {
  if (!sourceName) return "untitled.mhp";
  return sourceName.replace(/\.[^.]+$/, "") + ".mhp";
}
