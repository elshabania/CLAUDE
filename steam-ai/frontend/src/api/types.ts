/**
 * TypeScript mirrors of steam_ai/models.py and the REST contract in docs/api.md.
 * Keep field names identical to the Pydantic models so JSON round-trips untouched.
 */

export type Severity = 'Critical' | 'High' | 'Medium' | 'Info';
export const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Info'];
export const SEVERITY_RANK: Record<Severity, number> = { Critical: 0, High: 1, Medium: 2, Info: 3 };

export type LocationType =
  | 'link'
  | 'node'
  | 'zone'
  | 'line'
  | 'sector'
  | 'screenline'
  | 'matrix'
  | 'run';
export const LOCATION_TYPES: LocationType[] = [
  'link',
  'node',
  'zone',
  'line',
  'sector',
  'screenline',
  'matrix',
  'run',
];

export interface Location {
  type: LocationType;
  id: string;
  label?: string | null;
  lon?: number | null;
  lat?: number | null;
}

/** Where the evidence came from: file and row, so every number is traceable. */
export interface SourceRef {
  file: string;
  row?: number | null;
  table?: string | null;
  column?: string | null;
}

export interface Evidence {
  values: Record<string, unknown>;
  thresholds: Record<string, unknown>;
  sources: SourceRef[];
  period?: string | null;
  /** The DuckDB SQL that produced the values, for the modeller view. */
  query?: string | null;
}

export type EffectMethod = 'sketch_elasticity' | 'surrogate' | 'steam_rerun' | 'not_computable';
export type Confidence = 'low' | 'medium' | 'high';

/** A proposed action for a Critical or High finding. */
export interface Measure {
  measure_id: string;
  title: string;
  description: string;
  estimated_effect?: string | null;
  effect_values: Record<string, number>;
  method: EffectMethod;
  confidence: Confidence | string;
}

export interface Finding {
  finding_id: string;
  run_id: string;
  check_id: string;
  check_name: string;
  severity: Severity;
  location: Location;
  /** One sentence, no jargon. */
  executive_line: string;
  /** Evidence, method, files. */
  modeller_view: string;
  evidence: Evidence;
  likely_cause: string;
  suggested_action: string;
  measures: Measure[];
  /** False when inside the noise band. */
  is_significant: boolean;
  created_at: string;
}

export type CheckStatus = 'ok' | 'skipped' | 'error';

/** CheckResult as returned by GET /runs/{id}/checks (findings omitted). */
export interface CheckResult {
  check_id: string;
  check_name: string;
  status: CheckStatus;
  message?: string | null;
  duration_s: number;
  rows_examined: number;
  /** Findings count by severity; the API omits the findings themselves. */
  counts?: Partial<Record<Severity, number>> & { total?: number };
}

export interface HealthComponent {
  name: string;
  score: number;
  weight: number;
  detail: string;
}

export interface HealthScore {
  run_id: string;
  score: number;
  grade: string;
  components: HealthComponent[];
  counts: Partial<Record<Severity, number>>;
  /** Human-readable formula, published in the UI. */
  definition: string;
}

export interface KPI {
  kpi_id: string;
  name: string;
  value: number;
  unit: string;
  period?: string | null;
  definition: string;
  sources: SourceRef[];
}

export interface RunFile {
  path: string;
  size?: number;
  sha256?: string;
  table?: string | null;
}

export interface RunManifest {
  run_id: string;
  scenario_name: string;
  horizon_year: number;
  policy_set: string;
  base_run_id?: string | null;
  ingested_at: string;
  source_root: string;
  steam_version: string;
  is_synthetic: boolean;
  status: string;
  files: RunFile[];
  tables: Record<string, number>;
  periods: string[];
  /** Optional: when the diagnostic report was last generated (not in models.py yet). */
  report_generated_at?: string | null;
}

/** GET /runs/{id}: manifest plus health. */
export interface RunDetail extends RunManifest {
  health?: HealthScore | null;
}

/** GET /runs item. */
export interface RunSummary {
  run_id: string;
  scenario_name: string;
  horizon_year: number;
  base_run_id?: string | null;
  ingested_at: string;
  status: string;
  is_synthetic: boolean;
  health?: { score: number; grade: string } | null;
}

export interface FindingsPage {
  total: number;
  items: Finding[];
}

export interface FindingsQuery {
  severity?: Severity | '';
  check_id?: string;
  location_type?: LocationType | '';
  significant_only?: boolean;
  limit?: number;
  offset?: number;
}

/** One input file/table difference between a run and its base run. */
export interface InputDiff {
  file: string;
  table?: string | null;
  change: 'added' | 'removed' | 'modified' | string;
  rows_changed?: number | null;
  detail?: string | null;
}

export interface KpiDelta {
  kpi_id: string;
  name: string;
  unit: string;
  base_value: number | null;
  value: number | null;
  delta: number | null;
  delta_share?: number | null;
  is_significant?: boolean | null;
}

export interface RunChanges {
  base_run_id: string | null;
  inputs?: InputDiff[];
  findings?: {
    new: Finding[];
    resolved: Finding[];
    unchanged: Finding[] | number;
  };
  kpis?: KpiDelta[];
}

/** Properties on each feature of GET /runs/{id}/links. */
export interface LinkProperties {
  link_id: string;
  a_node: string;
  b_node: string;
  link_class: string;
  area_type: string;
  lanes: number;
  capacity_vph: number;
  ffs_kph: number;
  volume: number;
  vc_ratio: number;
  cong_speed_kph: number;
  delay_s: number;
  n_findings: number;
  max_severity: Severity | null;
}

export interface LineStringGeometry {
  type: 'LineString';
  coordinates: [number, number][];
}

export interface LinkFeature {
  type: 'Feature';
  id?: string | number;
  geometry: LineStringGeometry;
  properties: LinkProperties;
}

export interface LinkCollection {
  type: 'FeatureCollection';
  features: LinkFeature[];
}

export interface LinkFlow {
  period: string;
  user_class: string;
  volume: number;
  vc_ratio: number | null;
  cong_time_s?: number | null;
  cong_speed_kph: number | null;
  delay_s: number | null;
}

export interface LinkAttributes {
  link_id: string;
  a_node: string;
  b_node: string;
  length_m: number;
  link_class: string;
  area_type: string;
  lanes: number;
  capacity_vph: number;
  ffs_kph: number;
  oneway?: boolean;
  toll_point?: boolean;
  junction_type?: string | null;
  sector_id?: string | null;
}

/** GET /runs/{id}/links/{link_id}. */
export interface LinkProfile {
  link_id: string;
  attributes: LinkAttributes;
  flows: LinkFlow[];
  findings: Finding[];
  sources: SourceRef[];
  geometry?: LineStringGeometry | null;
}

export interface SeverityRule {
  when: string;
  severity: Severity;
}

/** One entry of the check catalogue (GET /checks), derived from config/checks.yaml. */
export interface CheckDefinition {
  check_id: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  params: Record<string, unknown>;
  severity: SeverityRule[];
}

export interface HealthDefinition {
  definition: string;
  penalties: Record<string, number>;
  weights: Record<string, number>;
  grades: Record<string, number>;
}

export interface ApiErrorShape {
  detail?: string | { msg: string }[];
}
