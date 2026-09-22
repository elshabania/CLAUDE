"""Model parameters that differ from their approved values."""

from __future__ import annotations

from typing import Any

from ..models import Finding
from ..store import RunStore
from .base import Check, evaluate_severity, make_finding, refs_from_rows, run_location


class ParameterDrift(Check):
    check_id = "parameter_drift"
    name = "Parameter drift"
    description = (
        "Every parameter with an approved value in the register must equal it; numeric "
        "values are compared numerically, others as trimmed text."
    )
    required_tables = {"parameters"}

    def run(
        self,
        store: RunStore,
        base: RunStore | None,
        params: dict[str, Any],
        severity_rules: list[dict[str, Any]],
    ) -> list[Finding]:
        tol = float(params.get("numeric_tolerance", 1e-9))
        sql = f"""
            SELECT key, value, approved_value, source_file, source_row,
                   TRY_CAST(value AS DOUBLE) AS v_num,
                   TRY_CAST(approved_value AS DOUBLE) AS a_num
            FROM parameters
            WHERE approved_value IS NOT NULL
              AND CASE
                    WHEN TRY_CAST(value AS DOUBLE) IS NOT NULL
                     AND TRY_CAST(approved_value AS DOUBLE) IS NOT NULL
                    THEN ABS(TRY_CAST(value AS DOUBLE) - TRY_CAST(approved_value AS DOUBLE))
                         > {tol} * GREATEST(1.0, ABS(TRY_CAST(approved_value AS DOUBLE)))
                    ELSE TRIM(COALESCE(value, '')) <> TRIM(approved_value)
                  END
            ORDER BY key
        """
        df = store.query(sql)
        self.rows_examined = store.row_count("parameters")
        out: list[Finding] = []
        for r in df.itertuples():
            numeric = r.v_num == r.v_num and r.a_num == r.a_num and r.v_num is not None \
                and r.a_num is not None
            change = None
            if numeric and float(r.a_num) != 0:
                change = (float(r.v_num) - float(r.a_num)) / abs(float(r.a_num))
            sev = evaluate_severity(severity_rules, drifted=True, key=r.key,
                                    change_share=change)
            if sev is None:
                continue
            out.append(
                make_finding(
                    run_id=store.run_id, check=self, severity=sev,
                    location=run_location(store, f"Parameter {r.key}"),
                    executive_line=f"Parameter {r.key} is set to {r.value} but the approved "
                    f"value is {r.approved_value}.",
                    likely_cause="Parameter edited for a test and not reverted, or the "
                    "approved register is out of date.",
                    suggested_action="Restore the approved value, or record the change and "
                    "get the new value approved.",
                    values={"key": r.key, "value": r.value, "approved_value": r.approved_value,
                            "change_share": change, "drifted": True},
                    thresholds={"numeric_tolerance": tol},
                    sources=refs_from_rows(df[df["key"] == r.key], "parameters", "value"),
                    query=sql, discriminator=str(r.key),
                    method="parameters.value vs approved_value (numeric or text)",
                )
            )
        return out
