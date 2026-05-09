declare module "dxf-parser" {
  export interface DxfPoint {
    x: number;
    y: number;
    z?: number;
  }

  export interface DxfEntity {
    type: string;
    layer?: string;
    handle?: string;
    vertices?: DxfPoint[];
    startPoint?: DxfPoint;
    endPoint?: DxfPoint;
    center?: DxfPoint;
    radius?: number;
    startAngle?: number;
    endAngle?: number;
    text?: string;
    position?: DxfPoint;
    [key: string]: unknown;
  }

  export interface DxfHeader {
    [key: string]: unknown;
  }

  export interface DxfTables {
    layer?: {
      layers?: Record<string, { name: string; color?: number; [k: string]: unknown }>;
    };
    [key: string]: unknown;
  }

  export interface Dxf {
    header?: DxfHeader;
    tables?: DxfTables;
    blocks?: Record<string, unknown>;
    entities: DxfEntity[];
  }

  export default class DxfParser {
    parseSync(source: string): Dxf;
    parse(source: string): Dxf;
  }
}
