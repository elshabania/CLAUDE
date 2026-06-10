"use client";

import {
  DIRS,
  MOVS,
  LOS_COLORS,
  LOS_TEXT,
  type JunctionInputs,
  type JunctionResult,
  type Cardinal,
  type Movement,
  type JunctionType,
  type CoordinationLevel,
} from "@/lib/hcm";

interface Props {
  junctionLabel: string;
  inputs: JunctionInputs;
  result: JunctionResult;
  onChange: (next: JunctionInputs) => void;
  onClose: () => void;
}

export function JunctionPanel({
  junctionLabel,
  inputs,
  result,
  onChange,
  onClose,
}: Props) {
  const update = (next: Partial<JunctionInputs>) => onChange({ ...inputs, ...next });
  const updateApproach = (
    dir: Cardinal,
    next: Partial<JunctionInputs["approaches"][Cardinal]>
  ) =>
    update({
      approaches: {
        ...inputs.approaches,
        [dir]: { ...inputs.approaches[dir], ...next },
      },
    });

  return (
    <div
      style={{
        width: 380,
        height: "100%",
        background: "#0f172a",
        borderLeft: "1px solid #1e293b",
        overflowY: "auto",
        color: "#e2e8f0",
        fontSize: 12,
      }}
    >
      <div
        style={{
          padding: 16,
          borderBottom: "1px solid #1e293b",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          background: "#0f172a",
          zIndex: 1,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{junctionLabel}</div>
          <div style={{ color: "#94a3b8", fontSize: 11 }}>HCM analysis</div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "transparent",
            border: 0,
            color: "#94a3b8",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      <section style={{ padding: 16, borderBottom: "1px solid #1e293b" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <LosBadge los={result.los} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>
              {result.delay.toFixed(1)} s
            </div>
            <div style={{ color: "#94a3b8", fontSize: 11 }}>weighted control delay</div>
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 8,
            fontSize: 11,
          }}
        >
          <Stat label="v/c max" value={result.vcMax.toFixed(2)} />
          <Stat label="Q95 max" value={`${result.q95mMax.toFixed(0)} m`} />
          <Stat label="Volume" value={`${result.totalVolume.toFixed(0)} vph`} />
        </div>
        {result.spillbackAny && (
          <div
            style={{
              marginTop: 10,
              padding: 8,
              background: "#7f1d1d",
              color: "#fee2e2",
              borderRadius: 4,
              fontSize: 11,
            }}
          >
            ⚠ Queue exceeds 85% of available link length on at least one approach.
          </div>
        )}
      </section>

      <section style={{ padding: 16, borderBottom: "1px solid #1e293b" }}>
        <h3 style={{ fontSize: 12, color: "#cbd5e1", margin: "0 0 10px" }}>Junction</h3>
        <Field label="Type">
          <select
            value={inputs.type}
            onChange={(e) => update({ type: e.target.value as JunctionType })}
            style={selectStyle}
          >
            <option value="signalized">Signalized</option>
            <option value="roundabout">Roundabout</option>
            <option value="twsc">Two-way stop</option>
          </select>
        </Field>
        <Field label="Cycle (s)">
          <NumberInput
            value={inputs.cycleLength}
            onChange={(v) => update({ cycleLength: v })}
            min={30}
            max={240}
            step={5}
          />
        </Field>
        <Field label="Coordination">
          <select
            value={inputs.coord ?? "isolated"}
            onChange={(e) =>
              update({ coord: e.target.value as CoordinationLevel })
            }
            style={selectStyle}
          >
            <option value="isolated">Isolated</option>
            <option value="good">Good progression</option>
            <option value="fair">Fair progression</option>
            <option value="poor">Poor progression</option>
          </select>
        </Field>
        <Field label="Heavy veh %">
          <NumberInput
            value={Math.round((inputs.hv ?? 0) * 100)}
            onChange={(v) => update({ hv: v / 100 })}
            min={0}
            max={50}
            step={1}
          />
        </Field>
      </section>

      {DIRS.map((dir) => {
        const a = inputs.approaches[dir];
        const ar = result.approaches[dir];
        return (
          <section
            key={dir}
            style={{ padding: 16, borderBottom: "1px solid #1e293b" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <h3 style={{ fontSize: 12, color: "#cbd5e1", margin: 0 }}>
                Approach {dir}
              </h3>
              <LosBadge los={ar.los} small />
            </div>
            <Field label="Green (s)">
              <NumberInput
                value={a.greenTime}
                onChange={(v) => updateApproach(dir, { greenTime: v })}
                min={5}
                max={inputs.cycleLength}
                step={1}
              />
            </Field>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr 1fr",
                gap: 6,
                marginTop: 8,
                fontSize: 11,
              }}
            >
              <div style={{ color: "#94a3b8" }}>Move</div>
              <div style={{ color: "#94a3b8" }}>Lanes</div>
              <div style={{ color: "#94a3b8" }}>Vol (vph)</div>
              {MOVS.map((m) => (
                <ApproachMovementRow
                  key={m}
                  m={m}
                  lanes={a.lanes[m]}
                  volume={a.volumes[m]}
                  onLanes={(v) =>
                    updateApproach(dir, {
                      lanes: { ...a.lanes, [m]: v },
                    })
                  }
                  onVolume={(v) =>
                    updateApproach(dir, {
                      volumes: { ...a.volumes, [m]: v },
                    })
                  }
                />
              ))}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 6,
                marginTop: 12,
                fontSize: 10,
                color: "#94a3b8",
              }}
            >
              <Stat label="v/c" value={ar.vcMax.toFixed(2)} small />
              <Stat label="delay" value={`${ar.delay.toFixed(0)} s`} small />
              <Stat label="Q95" value={`${ar.q95mMax.toFixed(0)} m`} small />
            </div>
          </section>
        );
      })}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: "#020617",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 12,
  width: "100%",
};

const inputStyle: React.CSSProperties = {
  background: "#020617",
  color: "#e2e8f0",
  border: "1px solid #334155",
  borderRadius: 4,
  padding: "4px 8px",
  fontSize: 12,
  width: "100%",
  fontFamily: "ui-monospace, SFMono-Regular, monospace",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        alignItems: "center",
        gap: 8,
        marginBottom: 6,
      }}
    >
      <span style={{ color: "#94a3b8" }}>{label}</span>
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => {
        const v = Number(e.target.value);
        if (Number.isFinite(v)) onChange(v);
      }}
      min={min}
      max={max}
      step={step}
      style={inputStyle}
    />
  );
}

function ApproachMovementRow({
  m,
  lanes,
  volume,
  onLanes,
  onVolume,
}: {
  m: Movement;
  lanes: number;
  volume: number;
  onLanes: (v: number) => void;
  onVolume: (v: number) => void;
}) {
  return (
    <>
      <div style={{ alignSelf: "center" }}>{m}</div>
      <NumberInput value={lanes} onChange={onLanes} min={0} max={6} step={1} />
      <NumberInput value={volume} onChange={onVolume} min={0} max={5000} step={10} />
    </>
  );
}

function Stat({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div>
      <div style={{ color: "#94a3b8", fontSize: small ? 10 : 11 }}>{label}</div>
      <div
        style={{
          fontWeight: 600,
          fontSize: small ? 12 : 14,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function LosBadge({
  los,
  small,
}: {
  los: keyof typeof LOS_COLORS;
  small?: boolean;
}) {
  return (
    <div
      style={{
        background: LOS_COLORS[los],
        color: "#0f172a",
        fontWeight: 700,
        borderRadius: 6,
        padding: small ? "2px 8px" : "4px 12px",
        fontSize: small ? 11 : 18,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
      title={LOS_TEXT[los]}
    >
      {los}
    </div>
  );
}
