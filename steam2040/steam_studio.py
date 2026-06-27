#!/usr/bin/env python3
"""Launch STEAM 2040 Studio (the merged desktop application).

Usage:
    python steam_studio.py
"""

import sys

from steam_app.gui import run

if __name__ == "__main__":
    sys.exit(run(sys.argv))
