import type { DxfPoint } from "dxf-parser";

export interface ExtractedPath {
  /** One or more subpaths (polylines). Coordinates in PDF user units, y-up. */
  subpaths: DxfPoint[][];
  strokeColor: [number, number, number] | null;
  fillColor: [number, number, number] | null;
  lineWidth: number;
  isStroked: boolean;
  isFilled: boolean;
  isClosed: boolean;
}

interface GraphicsState {
  ctm: number[];
  strokeColor: [number, number, number] | null;
  fillColor: [number, number, number] | null;
  lineWidth: number;
}

const IDENTITY: number[] = [1, 0, 0, 1, 0, 0];

const MINI_MOVE = 0;
const MINI_LINE = 1;
const MINI_CURVE = 2;
const MINI_CURVE2 = 3;
const MINI_CURVE3 = 4;
const MINI_CLOSE = 5;
const MINI_RECT = 6;

function multiply(a: number[], b: number[]): number[] {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5],
  ];
}

function applyCTM(ctm: number[], x: number, y: number): { x: number; y: number } {
  return {
    x: ctm[0] * x + ctm[2] * y + ctm[4],
    y: ctm[1] * x + ctm[3] * y + ctm[5],
  };
}

function cloneState(s: GraphicsState): GraphicsState {
  return {
    ctm: [...s.ctm],
    strokeColor: s.strokeColor ? [...s.strokeColor] : null,
    fillColor: s.fillColor ? [...s.fillColor] : null,
    lineWidth: s.lineWidth,
  };
}

function flattenCubic(
  p0: DxfPoint,
  c1: { x: number; y: number },
  c2: { x: number; y: number },
  p1: { x: number; y: number },
  out: DxfPoint[],
  steps = 8
) {
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    const x =
      u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x;
    const y =
      u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y;
    out.push({ x, y });
  }
}

function parseColor(arg: unknown): [number, number, number] | null {
  if (typeof arg === "string" && arg.startsWith("#") && arg.length === 7) {
    return [
      parseInt(arg.slice(1, 3), 16) / 255,
      parseInt(arg.slice(3, 5), 16) / 255,
      parseInt(arg.slice(5, 7), 16) / 255,
    ];
  }
  if (
    (typeof Uint8ClampedArray !== "undefined" && arg instanceof Uint8ClampedArray) ||
    (typeof Uint8Array !== "undefined" && arg instanceof Uint8Array)
  ) {
    if (arg.length >= 3) return [arg[0] / 255, arg[1] / 255, arg[2] / 255];
  }
  if (Array.isArray(arg) && arg.length >= 3) {
    const r = arg[0];
    const g = arg[1];
    const b = arg[2];
    if (typeof r === "number" && typeof g === "number" && typeof b === "number") {
      const norm = Math.max(r, g, b) > 1 ? 255 : 1;
      return [r / norm, g / norm, b / norm];
    }
  }
  return null;
}

function decodePathBuffer(
  buffer: ArrayLike<number>,
  ctm: number[]
): { subpaths: DxfPoint[][]; closed: boolean } {
  const subpaths: DxfPoint[][] = [];
  let current: DxfPoint[] = [];
  let closed = false;
  const len = buffer.length;
  let i = 0;
  const finish = () => {
    if (current.length > 0) subpaths.push(current);
    current = [];
  };
  while (i < len) {
    const op = buffer[i++];
    if (op === MINI_MOVE) {
      finish();
      const p = applyCTM(ctm, buffer[i], buffer[i + 1]);
      current.push({ x: p.x, y: p.y });
      i += 2;
    } else if (op === MINI_LINE) {
      const p = applyCTM(ctm, buffer[i], buffer[i + 1]);
      current.push({ x: p.x, y: p.y });
      i += 2;
    } else if (op === MINI_CURVE) {
      const last = current[current.length - 1];
      const c1 = applyCTM(ctm, buffer[i], buffer[i + 1]);
      const c2 = applyCTM(ctm, buffer[i + 2], buffer[i + 3]);
      const end = applyCTM(ctm, buffer[i + 4], buffer[i + 5]);
      if (last) flattenCubic(last, c1, c2, end, current);
      else current.push({ x: end.x, y: end.y });
      i += 6;
    } else if (op === MINI_CURVE2) {
      const last = current[current.length - 1];
      const c2 = applyCTM(ctm, buffer[i], buffer[i + 1]);
      const end = applyCTM(ctm, buffer[i + 2], buffer[i + 3]);
      if (last) flattenCubic(last, last, c2, end, current);
      else current.push({ x: end.x, y: end.y });
      i += 4;
    } else if (op === MINI_CURVE3) {
      const last = current[current.length - 1];
      const c1 = applyCTM(ctm, buffer[i], buffer[i + 1]);
      const end = applyCTM(ctm, buffer[i + 2], buffer[i + 3]);
      if (last) flattenCubic(last, c1, end, end, current);
      else current.push({ x: end.x, y: end.y });
      i += 4;
    } else if (op === MINI_CLOSE) {
      if (current.length > 0) {
        const first = current[0];
        current.push({ x: first.x, y: first.y });
      }
      closed = true;
    } else if (op === MINI_RECT) {
      finish();
      const x = buffer[i];
      const y = buffer[i + 1];
      const w = buffer[i + 2];
      const h = buffer[i + 3];
      const p1 = applyCTM(ctm, x, y);
      const p2 = applyCTM(ctm, x + w, y);
      const p3 = applyCTM(ctm, x + w, y + h);
      const p4 = applyCTM(ctm, x, y + h);
      subpaths.push([p1, p2, p3, p4, p1]);
      i += 4;
    } else {
      break;
    }
  }
  finish();
  return { subpaths, closed };
}

export interface PdfjsOpList {
  fnArray: ArrayLike<number>;
  argsArray: unknown[];
}

export interface PdfjsLikeDoc {
  numPages: number;
  getPage(n: number): Promise<{ getOperatorList(): Promise<PdfjsOpList> }>;
}

export type PdfjsLikeOps = Record<string, number>;

/**
 * Walk every page of a pdfjs document and emit one ExtractedPath per painted
 * path operation. Pure: takes pdfjs's OPS table and the document object so it
 * can run in either Node (via unpdf) or the browser (pdfjs-dist).
 */
export async function walkPdfDocument(
  OPS: PdfjsLikeOps,
  doc: PdfjsLikeDoc
): Promise<ExtractedPath[]> {
  const STROKE_OPS = new Set<number>([
    OPS.stroke,
    OPS.closeStroke,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ]);
  const FILL_OPS = new Set<number>([
    OPS.fill,
    OPS.eoFill,
    OPS.fillStroke,
    OPS.eoFillStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ]);
  const CLOSE_OPS = new Set<number>([
    OPS.closeStroke,
    OPS.closeFillStroke,
    OPS.closeEOFillStroke,
  ]);

  const result: ExtractedPath[] = [];

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const opList = await page.getOperatorList();

    let state: GraphicsState = {
      ctm: [...IDENTITY],
      strokeColor: null,
      fillColor: null,
      lineWidth: 1,
    };
    const stack: GraphicsState[] = [];

    for (let i = 0; i < opList.fnArray.length; i++) {
      const op = opList.fnArray[i];
      const args = opList.argsArray[i] as unknown[] | undefined;

      if (op === OPS.save) {
        stack.push(cloneState(state));
      } else if (op === OPS.restore) {
        const popped = stack.pop();
        if (popped) state = popped;
      } else if (op === OPS.transform && args) {
        state.ctm = multiply(
          [
            args[0] as number,
            args[1] as number,
            args[2] as number,
            args[3] as number,
            args[4] as number,
            args[5] as number,
          ],
          state.ctm
        );
      } else if (op === OPS.setLineWidth && args) {
        state.lineWidth = args[0] as number;
      } else if (op === OPS.setStrokeRGBColor && args) {
        state.strokeColor = parseColor(args[0]);
      } else if (op === OPS.setFillRGBColor && args) {
        state.fillColor = parseColor(args[0]);
      } else if (op === OPS.constructPath && args) {
        const terminalOp = args[0];
        const bufferContainer = args[1];
        const flat = Array.isArray(bufferContainer) ? bufferContainer[0] : null;
        if (typeof terminalOp !== "number" || !flat) continue;
        const isStroked = STROKE_OPS.has(terminalOp);
        const isFilled = FILL_OPS.has(terminalOp);
        if (!isStroked && !isFilled) continue;

        const { subpaths, closed } = decodePathBuffer(
          flat as ArrayLike<number>,
          state.ctm
        );
        if (subpaths.length === 0) continue;

        result.push({
          subpaths,
          strokeColor: state.strokeColor,
          fillColor: state.fillColor,
          lineWidth: state.lineWidth * Math.hypot(state.ctm[0], state.ctm[1]),
          isStroked,
          isFilled,
          isClosed: closed || CLOSE_OPS.has(terminalOp),
        });
      }
    }
  }

  return result;
}

