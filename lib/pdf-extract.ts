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
  ctm: number[]; // [a, b, c, d, e, f]
  strokeColor: [number, number, number] | null;
  fillColor: [number, number, number] | null;
  lineWidth: number;
}

const IDENTITY: number[] = [1, 0, 0, 1, 0, 0];

// Path mini-op codes used inside `constructPath` args (separate from OPS codes).
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
  if (arg instanceof Uint8ClampedArray || arg instanceof Uint8Array) {
    if (arg.length >= 3) return [arg[0] / 255, arg[1] / 255, arg[2] / 255];
  }
  if (Array.isArray(arg) && arg.length >= 3) {
    const r = arg[0];
    const g = arg[1];
    const b = arg[2];
    if (typeof r === "number" && typeof g === "number" && typeof b === "number") {
      // pdfjs may pass raw 0..255 or 0..1; normalise.
      const norm = Math.max(r, g, b) > 1 ? 255 : 1;
      return [r / norm, g / norm, b / norm];
    }
  }
  return null;
}

/**
 * Walk one constructPath buffer (flat array of [miniOp, ...coords, miniOp, ...]) and
 * return one or more subpaths in user space.
 */
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
      // Unknown mini-op: bail out to avoid corrupt parse.
      break;
    }
  }
  finish();
  return { subpaths, closed };
}

interface ExtractOptions {
  /** Skip paths whose bbox area is below this fraction of the page bbox. */
  minRelativeArea?: number;
}

/**
 * Extract vector paths from every page of the PDF, in user-space coordinates,
 * tagged with their stroke colour, fill colour and line width.
 *
 * pdfjs v4+ encodes constructPath as `[terminalOp, [Float32Array], minMax]`
 * where the buffer interleaves mini-op codes (0..6) with their numeric args.
 * The terminal op (stroke / fill / endPath) tells us how the path is painted.
 */
export async function extractPdfPaths(
  buffer: Buffer,
  options: ExtractOptions = {}
): Promise<ExtractedPath[]> {
  const { getResolvedPDFJS, getDocumentProxy } = await import("unpdf");
  const pdfjs = await getResolvedPDFJS();
  const doc = await getDocumentProxy(new Uint8Array(buffer));

  const OPS = pdfjs.OPS as Record<string, number>;
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
      const args = opList.argsArray[i];

      if (op === OPS.save) {
        stack.push(cloneState(state));
      } else if (op === OPS.restore) {
        const popped = stack.pop();
        if (popped) state = popped;
      } else if (op === OPS.transform) {
        state.ctm = multiply([args[0], args[1], args[2], args[3], args[4], args[5]], state.ctm);
      } else if (op === OPS.setLineWidth) {
        state.lineWidth = args[0];
      } else if (op === OPS.setStrokeRGBColor) {
        state.strokeColor = parseColor(args[0]);
      } else if (op === OPS.setFillRGBColor) {
        state.fillColor = parseColor(args[0]);
      } else if (op === OPS.constructPath) {
        const terminalOp = args?.[0];
        const bufferContainer = args?.[1];
        const flat = Array.isArray(bufferContainer) ? bufferContainer[0] : null;
        if (typeof terminalOp !== "number" || !flat) continue;
        const isStroked = STROKE_OPS.has(terminalOp);
        const isFilled = FILL_OPS.has(terminalOp);
        if (!isStroked && !isFilled) continue;

        const { subpaths, closed } = decodePathBuffer(flat as ArrayLike<number>, state.ctm);
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

  if (options.minRelativeArea && result.length > 0) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of result) {
      for (const sp of p.subpaths) {
        for (const pt of sp) {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        }
      }
    }
    const pageArea = Math.max((maxX - minX) * (maxY - minY), 1);
    const threshold = pageArea * options.minRelativeArea;
    return result.filter((p) => {
      let pminX = Infinity,
        pminY = Infinity,
        pmaxX = -Infinity,
        pmaxY = -Infinity;
      for (const sp of p.subpaths) {
        for (const pt of sp) {
          if (pt.x < pminX) pminX = pt.x;
          if (pt.y < pminY) pminY = pt.y;
          if (pt.x > pmaxX) pmaxX = pt.x;
          if (pt.y > pmaxY) pmaxY = pt.y;
        }
      }
      return (pmaxX - pminX) * (pmaxY - pminY) >= threshold;
    });
  }
  return result;
}
