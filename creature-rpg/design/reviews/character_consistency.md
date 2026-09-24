# Character Consistency Gate: Decision Records

This log is append-only. Each entry records one gate decision by the Release and Character Consistency Agent, made under `design/release_character_gate.md`. A correction is a new entry that references the one it supersedes; existing entries are never edited.

Each entry here must have a matching object in `design/reviews/gate_status.json`. Deploy tooling checks that file (see gate doc §3.6).

Decision values:
- `pass`
- `conditional_pass`
- `fail`
- `pending`: used only for design-phase entries; it never authorizes a deployment.

Check status values:
- `pass`
- `fail`
- `warn`
- `not_run`
- `not_measured`
- `not_applicable` (a reason is required)

---

## Template (copy below the last entry)

```markdown
## <Phase N | Deploy <target>> — <decision> — <YYYY-MM-DD>  {#p<N>-<sha7>}

| Field | Value |
|---|---|
| Date | YYYY-MM-DD |
| Phase / target | Phase N (<name>) / deploy:<preview|production> |
| Build commit | <40-hex sha> |
| Gate commit | <sha of the commit adding this entry> |
| Reviewer(s) | release-character-agent; second reviewer: <name> |
| Orchestrator acknowledgement | <name / pending> |
| Supersedes | <entry anchor or "none"> |
| Automated report | reports/gate/character/<sha>/report.json (sha256: <hex>) — exit code <0|1> |
| Silhouette sheets | reports/gate/character/<sha>/silhouettes_256.png, silhouettes_20.png, silhouette_pairs.csv |
| Manual captures | reports/review/phase<N>/<sha>/screens/ (<count> files) |
| Rubric | reports/review/phase<N>/<sha>/rubric.csv |
| QA gate (same commit) | <link to QA record> — <decision> |

### Scope
In-scope species/characters/surfaces per gate doc §2.1: <list>

### Automated checks
| Check | Status | Notes / evidence |
|---|---|---|
| GC-00 … GC-16 (GC-17 for deploys) | pass/fail/warn/not_run/not_applicable | <path or reason> |

### Checklist items
| Item | Status | Evidence (scene files, report keys) |
|---|---|---|
| CC-01 … CC-17 | | |

### Rubric summary
| Subject | Appeal | Expr. | Read. | Orig. | Cohesion | Below threshold? |
|---|---|---|---|---|---|---|

Roster means: Appeal x.x / Expr. x.x / Read. x.x / Cohesion x.x

### Findings
| ID | Severity | Subject | Description (cite files; name any specific existing character or element involved) | Owner | Status |
|---|---|---|---|---|---|
| F-<N>-01 | Critical/Major/Minor/Note | | | | open/fixed@<sha>/disputed |

### Tier B terminology judgments
| Term | Location | Judgment (generic English / replace) | By |
|---|---|---|---|

### Conditions (conditional pass only; at most 5, Minor only, carried forward at most one gate)
| ID | Finding | Owner | Fix by phase |
|---|---|---|---|

### Not run / Not measured
- <check>: <reason>

### Decision
**<pass | conditional_pass | fail>**. Rationale: <one paragraph>. A fail blocks this phase and every deployment until the problem is corrected and retested on a new build commit.
```

---

## Phase 0 (design) — pending — 2026-09-24  {#p0-design}

| Field | Value |
|---|---|
| Date | 2026-09-24 |
| Phase / target | Phase 0 (design documents) / no deployment |
| Build commit | none. No game code exists yet. |
| Reviewer(s) | release-character-agent |
| Orchestrator acknowledgement | pending |
| Supersedes | none |
| Automated report | Not run. `npm run gate:character` is not implemented yet. |
| Manual captures | Not run. There is no build to capture. |

### Scope
The design documents being written in parallel:
- `creative_direction.md`
- `creatures.md`
- `systems.md`
- `world.md`
- `rendering_and_architecture.md`
- `qa_plan.md`
- `release_character_gate.md`

### Status
- The documents are in progress. No character designs, silhouettes, names or UI have been reviewed yet.
- Once `creative_direction.md` and `creatures.md` exist, the following reviews are due:
  - A document-level originality pre-review: names checked against the gate doc §3.4 denylist and the GC-13 similarity threshold, run manually.
  - The known-risk watchlist in gate doc §4.2: Rippleback, Voltra, Emberhorn, and the capture-device design.
  - Confirmation of the dependency items in gate doc §7.2.

### Findings
None yet.

### Not run / Not measured
- All automated checks (GC-00 through GC-17): Not run, because they are not implemented and there is no build.
- All manual rubric scoring: Not run, because there are no renders.

### Decision
**pending**. The documents are in progress. This entry authorizes no deployment.
