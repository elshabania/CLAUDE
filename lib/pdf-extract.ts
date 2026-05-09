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
  /** Innermost OCG layer name when the path was drawn inside one. */
  layer: string | null;
}

interface GraphicsState {
  ctm: number[];
  strokeColor: [number, number, number] | null;
  fillColor: [number, number, number] | null;
  lineWidth: number;
}

const IDENTITY: number[] = [1, 0, 0, 1, 0, 0];

// Path mini-op codes used by pdfjs's *legacy* build inside the interleaved
// `constructPath` buffer.
const MINI_MOVE = 0;
const MINI_LINE = 1;
const MINI_CURVE = 2;
const MINI_CURVE2 = 3;
const MINI_CURVE3 = 4;
const MINI_CLOSE = 5;
const MINI_RECT = 6;

interface PathOpsTable {
  moveTo: number;
  lineTo: number;
  curveTo: number;
  curveTo2: number;
  curveTo3: number;
  closePath: number;
  rectangle: number;
}

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

/**
 * Decode the legacy build's interleaved `[op, ...coords, op, ...coords]`
 * buffer (mini-op codes 0..6).
 */
function decodeLegacyBuffer(
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

/**
 * Decode the modern build's separate ops + args arrays. `ops` contains
 * full OPS codes (moveTo / lineTo / curveTo / ...); `args` is a flat
 * coords array consumed in the order the ops dictate.
 */
function decodeModernPath(
  ops: ArrayLike<number>,
  args: ArrayLike<number>,
  ctm: number[],
  table: PathOpsTable
): { subpaths: DxfPoint[][]; closed: boolean } {
  const subpaths: DxfPoint[][] = [];
  let current: DxfPoint[] = [];
  let closed = false;
  let argIdx = 0;
  const finish = () => {
    if (current.length > 0) subpaths.push(current);
    current = [];
  };
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (op === table.moveTo) {
      finish();
      const p = applyCTM(ctm, args[argIdx], args[argIdx + 1]);
      current.push({ x: p.x, y: p.y });
      argIdx += 2;
    } else if (op === table.lineTo) {
      const p = applyCTM(ctm, args[argIdx], args[argIdx + 1]);
      current.push({ x: p.x, y: p.y });
      argIdx += 2;
    } else if (op === table.curveTo) {
      const last = current[current.length - 1];
      const c1 = applyCTM(ctm, args[argIdx], args[argIdx + 1]);
      const c2 = applyCTM(ctm, args[argIdx + 2], args[argIdx + 3]);
      const end = applyCTM(ctm, args[argIdx + 4], args[argIdx + 5]);
      if (last) flattenCubic(last, c1, c2, end, current);
      else current.push({ x: end.x, y: end.y });
      argIdx += 6;
    } else if (op === table.curveTo2) {
      const last = current[current.length - 1];
      const c2 = applyCTM(ctm, args[argIdx], args[argIdx + 1]);
      const end = applyCTM(ctm, args[argIdx + 2], args[argIdx + 3]);
      if (last) flattenCubic(last, last, c2, end, current);
      else current.push({ x: end.x, y: end.y });
      argIdx += 4;
    } else if (op === table.curveTo3) {
      const last = current[current.length - 1];
      const c1 = applyCTM(ctm, args[argIdx], args[argIdx + 1]);
      const end = applyCTM(ctm, args[argIdx + 2], args[argIdx + 3]);
      if (last) flattenCubic(last, c1, end, end, current);
      else current.push({ x: end.x, y: end.y });
      argIdx += 4;
    } else if (op === table.closePath) {
      if (current.length > 0) {
        const first = current[0];
        current.push({ x: first.x, y: first.y });
      }
      closed = true;
    } else if (op === table.rectangle) {
      finish();
      const x = args[argIdx];
      const y = args[argIdx + 1];
      const w = args[argIdx + 2];
      const h = args[argIdx + 3];
      const p1 = applyCTM(ctm, x, y);
      const p2 = applyCTM(ctm, x + w, y);
      const p3 = applyCTM(ctm, x + w, y + h);
      const p4 = applyCTM(ctm, x, y + h);
      subpaths.push([p1, p2, p3, p4, p1]);
      argIdx += 4;
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
  getOptionalContentConfig?: () => Promise<PdfjsLikeOptionalContentConfig | null>;
}

export interface PdfjsLikeOptionalContentConfig {
  getGroup?: (id: string) => { name?: string } | null | undefined;
  getOrder?: () =>
    | (string | { groups?: string[]; name?: string })[]
    | null
    | undefined;
}

export type PdfjsLikeOps = Record<string, number>;

/**
 * Strip the AutoCAD-export prefix from a raw OCG layer name. Examples:
 *   "37478110-HS-PRIME-RCMP-...|X_PRIME-MP_Anchor Assets$0$-MP_BLDG"
 *     -> "MP_BLDG"
 *   "...|X_PRIME-MP-VILLA-TH PLOT_I-REV2$0$-LU_H-Resi_Villa+TH"
 *     -> "LU_H-Resi_Villa+TH"
 */
export function cleanLayerName(raw: string): string {
  if (!raw) return raw;
  const m = raw.match(/\$\d+\$-(.+)$/);
  if (m) return m[1].trim();
  const piped = raw.split("|").pop() ?? raw;
  return piped.trim();
}

/**
 * Walk every page of a pdfjs document and emit one ExtractedPath per painted
 * path operation. Pure: takes pdfjs's OPS table and the document object so it
 * works against either pdfjs-dist's modern build (browser) or its legacy
 * build (Node via unpdf). The two builds encode `constructPath` differently
 * - see `decodeLegacyBuffer` and `decodeModernPath` for the formats.
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
  const PAINT_OPS = new Set<number>([...STROKE_OPS, ...FILL_OPS, OPS.endPath]);
  const pathOpsTable: PathOpsTable = {
    moveTo: OPS.moveTo,
    lineTo: OPS.lineTo,
    curveTo: OPS.curveTo,
    curveTo2: OPS.curveTo2,
    curveTo3: OPS.curveTo3,
    closePath: OPS.closePath,
    rectangle: OPS.rectangle,
  };

  const result: ExtractedPath[] = [];

  // Build OCG id -> clean layer name lookup once per document. AutoCAD-style
  // PDFs often nest groups under a parent group, so we walk both flat ids and
  // nested order entries.
  const layerNameById = new Map<string, string>();
  if (doc.getOptionalContentConfig) {
    try {
      const cfg = await doc.getOptionalContentConfig();
      const order = cfg?.getOrder?.() ?? [];
      const visit = (entry: unknown) => {
        if (!entry) return;
        if (typeof entry === "string") {
          const g = cfg?.getGroup?.(entry);
          if (g && typeof g.name === "string") {
            layerNameById.set(entry, cleanLayerName(g.name));
          }
        } else if (typeof entry === "object" && entry && "groups" in entry) {
          const groups = (entry as { groups?: string[] }).groups ?? [];
          for (const sub of groups) visit(sub);
        }
      };
      for (const entry of order) visit(entry);
    } catch {
      // Non-fatal: fall back to colour clustering if OCG metadata is missing.
    }
  }

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
    // Stack of OCG layer names for the current marked-content nesting. The
    // top entry is the innermost layer; null entries push for non-OC marked
    // content so begin/end pairs balance regardless of tag type.
    const layerStack: (string | null)[] = [];
    const currentLayer = () => {
      for (let k = layerStack.length - 1; k >= 0; k--) {
        const v = layerStack[k];
        if (v) return v;
      }
      return null;
    };

    // Modern-build pending path: filled in by `constructPath`, painted by the
    // subsequent stroke / fill / endPath operator.
    let pendingPath: {
      subpaths: DxfPoint[][];
      closed: boolean;
      lineWidth: number;
      strokeColor: [number, number, number] | null;
      fillColor: [number, number, number] | null;
      layer: string | null;
    } | null = null;

    const emit = (
      isStroked: boolean,
      isFilled: boolean,
      isClosed: boolean,
      pending: NonNullable<typeof pendingPath>
    ) => {
      if (pending.subpaths.length === 0) return;
      result.push({
        subpaths: pending.subpaths,
        strokeColor: pending.strokeColor,
        fillColor: pending.fillColor,
        lineWidth: pending.lineWidth,
        isStroked,
        isFilled,
        isClosed: pending.closed || isClosed,
        layer: pending.layer,
      });
    };

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
        // Legacy build wraps the colour in a one-element array; modern build
        // passes the Uint8ClampedArray directly as the args entry.
        state.strokeColor = parseColor(args) ?? parseColor((args as unknown[])[0]);
      } else if (op === OPS.setFillRGBColor && args) {
        state.fillColor = parseColor(args) ?? parseColor((args as unknown[])[0]);
      } else if (op === OPS.beginMarkedContentProps && args) {
        // args is `[tag, properties]`. For OCG layers tag === "OC" and
        // properties.id is the OCG group id. Anything else just balances
        // the stack with a null entry.
        const tag = args[0];
        const props = args[1] as { id?: string; type?: string } | null;
        if (tag === "OC" && props && typeof props.id === "string") {
          layerStack.push(layerNameById.get(props.id) ?? null);
        } else {
          layerStack.push(null);
        }
      } else if (op === OPS.beginMarkedContent) {
        layerStack.push(null);
      } else if (op === OPS.endMarkedContent) {
        layerStack.pop();
      } else if (op === OPS.constructPath && args) {
        const arg0 = args[0];
        const lineWidthHere =
          state.lineWidth * Math.hypot(state.ctm[0], state.ctm[1]);
        const layerHere = currentLayer();

        if (Array.isArray(arg0)) {
          // Modern build: separate ops + args. Defer paint until the next
          // stroke / fill / endPath op in fnArray.
          const ops = arg0 as number[];
          const flatArgs = (args[1] ?? []) as ArrayLike<number>;
          const { subpaths, closed } = decodeModernPath(
            ops,
            flatArgs,
            state.ctm,
            pathOpsTable
          );
          pendingPath = {
            subpaths,
            closed,
            lineWidth: lineWidthHere,
            strokeColor: state.strokeColor,
            fillColor: state.fillColor,
            layer: layerHere,
          };
        } else if (typeof arg0 === "number") {
          // Legacy build: terminal op embedded in args[0], buffer in args[1][0].
          const terminalOp = arg0;
          const bufferContainer = args[1];
          const flat = Array.isArray(bufferContainer) ? bufferContainer[0] : null;
          if (!flat) continue;
          const isStroked = STROKE_OPS.has(terminalOp);
          const isFilled = FILL_OPS.has(terminalOp);
          if (!isStroked && !isFilled) continue;
          const { subpaths, closed } = decodeLegacyBuffer(
            flat as ArrayLike<number>,
            state.ctm
          );
          if (subpaths.length === 0) continue;
          result.push({
            subpaths,
            strokeColor: state.strokeColor,
            fillColor: state.fillColor,
            lineWidth: lineWidthHere,
            isStroked,
            isFilled,
            isClosed: closed || CLOSE_OPS.has(terminalOp),
            layer: layerHere,
          });
        }
      } else if (PAINT_OPS.has(op) && pendingPath) {
        // Modern-build paint operator finishing the deferred path.
        const isStroked = STROKE_OPS.has(op);
        const isFilled = FILL_OPS.has(op);
        const isClosed = CLOSE_OPS.has(op);
        if (isStroked || isFilled) {
          emit(isStroked, isFilled, isClosed, pendingPath);
        }
        pendingPath = null;
      }
    }
  }

  return result;
}

