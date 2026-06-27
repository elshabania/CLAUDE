#!/usr/bin/env python3
"""Launch STEAM 2040 Studio as a local web app (browser UI).

Starts a local server and opens your browser. Everything runs on your machine,
offline. Point it at your data with the STEAM_DATA_DIR environment variable
(a folder containing the network shapefile/CSV, the land-use CSV and the OD CSV),
or load files from the UI.

    python steam_web.py [--host 127.0.0.1] [--port 8732] [--no-browser]
"""

import argparse
import sys

from steam_app.web import serve


def main(argv=None):
    p = argparse.ArgumentParser(description="STEAM 2040 Studio (web app)")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8732)
    p.add_argument("--no-browser", action="store_true")
    args = p.parse_args(argv)
    print(f"STEAM 2040 Studio running at http://{args.host}:{args.port}  (Ctrl+C to stop)")
    serve(host=args.host, port=args.port, open_browser=not args.no_browser)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
