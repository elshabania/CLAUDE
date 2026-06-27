"""Local web backend for STEAM 2040 Studio (browser UI)."""

from .server import create_app, serve

__all__ = ["create_app", "serve"]
