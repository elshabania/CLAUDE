"""STEAM 2040 Studio launcher.

Boot sequence (spec section 6):
  1. pick a free localhost port,
  2. start uvicorn in-process on a background thread,
  3. open a pywebview window pointing at it (falls back to the system browser
     if pywebview is unavailable),
  4. shut the server down on window close.

Run headless (server only, no window) with ``--headless`` — used by tests and
CI smoke checks.
"""
from __future__ import annotations

import argparse
import socket
import threading
import time

import uvicorn

from steam.server import create_app
from steam.state import AppState


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_up(host, port, timeout=15.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.1)
    return False


def run_server(app, host, port):
    config = uvicorn.Config(app, host=host, port=port, log_level="warning")
    server = uvicorn.Server(config)
    server.run()


def main():
    ap = argparse.ArgumentParser(description="STEAM 2040 Studio")
    ap.add_argument("--headless", action="store_true",
                    help="run the backend only, no desktop window")
    ap.add_argument("--port", type=int, default=0, help="port (0 = auto)")
    ap.add_argument("--load-demo", action="store_true",
                    help="preload the embedded demo network on boot")
    args = ap.parse_args()

    state = AppState()
    if args.load_demo:
        from steam.commands import dispatch
        dispatch(state, "load_demo", {})

    app = create_app(state)
    host = "127.0.0.1"
    port = args.port or _free_port()

    t = threading.Thread(target=run_server, args=(app, host, port), daemon=True)
    t.start()
    if not _wait_up(host, port):
        raise SystemExit("Backend failed to start")
    url = f"http://{host}:{port}/"
    print(f"STEAM 2040 backend ready at {url}")

    if args.headless:
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            return

    try:
        import webview  # pywebview
        window = webview.create_window("STEAM 2040 Studio", url,
                                       width=1440, height=900, min_size=(960, 600))
        webview.start()
    except Exception as e:  # pragma: no cover - fallback path
        print(f"pywebview unavailable ({e}); opening system browser.")
        import webbrowser
        webbrowser.open(url)
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            return


if __name__ == "__main__":
    main()
