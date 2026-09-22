"""STEAM-AI command line. Every long-running action here is the same code the
API and the watch folder call, so behaviour is identical from all entry points.
"""

from __future__ import annotations

import json
from pathlib import Path

import typer

from . import __version__
from .paths import DATA_DIR, watch_dir

app = typer.Typer(help="STEAM-AI: post-run diagnostics for STEAM v4.", no_args_is_help=True)


@app.callback()
def _root() -> None:
    """STEAM-AI command line."""


@app.command()
def version() -> None:
    typer.echo(f"steam-ai {__version__} (data dir: {DATA_DIR})")


@app.command()
def synth(
    out: Path = typer.Argument(..., help="Export directory to create"),
    scenario: str = typer.Option("BASE_2025"),
    horizon_year: int = typer.Option(2025),
    variant: str = typer.Option("base", help="base | scenario | scenario_unexplained"),
    seed: int = typer.Option(1),
    zones: int = typer.Option(60),
    grid: int = typer.Option(14),
    defects: str = typer.Option("", help="Comma-separated defect names, or 'all'"),
) -> None:
    """Generate a synthetic STEAM-like export directory (labelled synthetic)."""
    from .synthetic.generate import ALL_DEFECTS, generate_run

    dset = set(ALL_DEFECTS) if defects == "all" else {d for d in defects.split(",") if d}
    path = generate_run(out, scenario=scenario, horizon_year=horizon_year, seed=seed,
                        n_zones=zones, grid=grid, defects=dset, variant=variant)
    typer.echo(f"synthetic export written to {path} (defects: {sorted(dset) or 'none'})")


@app.command("import-steam")
def import_steam(
    ref_dir: Path = typer.Argument(Path(__file__).resolve().parents[2] / "reference" / "steam_v322",
                                   help="Folder with the recovered STEAM v3.2.2 blobs"),
    out_root: Path = typer.Option(None, help="Where to write the exports (default: watch dir)"),
) -> None:
    """Write 2025 and 2040 export directories from the recovered STEAM v3.2.2 inputs."""
    from .importers.steam_v322 import build_both

    out = build_both(ref_dir, out_root or watch_dir())
    for year, path in out.items():
        typer.echo(f"{year}: {path}")


@app.command()
def inspect(path: Path, markdown: bool = typer.Option(True)) -> None:
    """Inventory a directory of STEAM files (data_contract.md Section 3)."""
    from .inspect_tool import inspect_dir, render_markdown

    report = inspect_dir(path)
    typer.echo(render_markdown(report) if markdown else json.dumps(report, indent=2, default=str))


@app.command()
def ingest(
    path: Path,
    base_run_id: str | None = typer.Option(None),
    run_id: str | None = typer.Option(None),
) -> None:
    """Ingest an export directory into an immutable run dataset (no checks)."""
    from .ingest import ingest_export_dir

    m = ingest_export_dir(path, base_run_id=base_run_id, run_id=run_id)
    typer.echo(f"ingested run {m.run_id}: {m.tables}")


@app.command()
def check(run_id: str, only: str = typer.Option("", help="Comma-separated check ids"),
          report: bool = typer.Option(True)) -> None:
    """Run the diagnostic checks (and report) on an ingested run."""
    from .pipeline import run_checks
    from .store import RunStore

    run_checks(run_id, make_report=report, only=[c for c in only.split(",") if c] or None)
    store = RunStore(run_id)
    h = store.health()
    typer.echo(f"run {run_id}: health {h.score:.0f} ({h.grade}), findings "
               f"{h.counts}" if h else f"run {run_id}: checks done")


@app.command()
def process(
    path: Path,
    base_run_id: str | None = typer.Option(None),
    run_id: str | None = typer.Option(None),
    report: bool = typer.Option(True),
) -> None:
    """Ingest + checks + solutions + health + KPIs + report in one step."""
    from .pipeline import process_export_dir

    rid = process_export_dir(path, base_run_id=base_run_id, run_id=run_id, make_report=report)
    typer.echo(f"processed run {rid}")


@app.command()
def report(run_id: str) -> None:
    """(Re)generate the diagnostic report for a run."""
    from .reports.diagnostic import build
    from .store import RunStore

    out = build(RunStore(run_id))
    typer.echo("\n".join(f"{k}: {v}" for k, v in out.items()))


@app.command()
def snapshot(
    out: Path = typer.Argument(..., help="Output directory (replaced)"),
    run: list[str] = typer.Option(None, help="Run ids to include (default: all)"),
) -> None:
    """Write the API's responses as static files for the web app's static mode."""
    from .snapshot import write_snapshot

    for rid, info in write_snapshot(out, run or None).items():
        typer.echo(f"{rid:40s} {info['links']:>8,} links  {', '.join(info['files'])}")


@app.command()
def runs() -> None:
    """List ingested runs."""
    from .store import list_runs

    for m in list_runs():
        typer.echo(f"{m.run_id:40s} {m.scenario_name:20s} {m.horizon_year} {m.status:10s} "
                   f"{'SYNTHETIC' if m.is_synthetic else ''}")


@app.command()
def watch(
    directory: Path = typer.Argument(None, help="Defaults to <data>/watch"),
    once: bool = typer.Option(False, help="Process what is there and exit"),
) -> None:
    """Watch a folder; process every export directory whose sentinel appears."""
    from .pipeline import process_export_dir
    from .watch import watch as _watch

    d = directory or watch_dir()
    d.mkdir(parents=True, exist_ok=True)
    typer.echo(f"watching {d}")

    def on_ready(p: Path) -> None:
        typer.echo(f"export complete at {p}; processing")
        rid = process_export_dir(p)
        typer.echo(f"processed run {rid}")

    _watch(d, on_ready, once=once)


@app.command()
def serve(host: str = typer.Option("127.0.0.1"), port: int = typer.Option(8000),
          reload: bool = typer.Option(False)) -> None:
    """Start the API and the web app."""
    import uvicorn

    uvicorn.run("steam_ai.api.app:app", host=host, port=port, reload=reload)


if __name__ == "__main__":
    app()
