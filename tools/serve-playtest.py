#!/usr/bin/env python3
"""Static file server for playtesting, with caching switched off.

`python -m http.server` sends no Cache-Control header, so browsers apply
heuristic caching to the runtime modules. That is exactly what corrupted the
2026-08-12 session: the files that had never been fetched before - the missions
and power-up runtimes - loaded fresh, while gate-slice-runtime.js came from
cache. The report looked complete but described a build that did not exist,
and a whole test round was spent working that out.

Every response here carries `Cache-Control: no-store`, so a playtest always
measures what is actually on disk.

Usage, from the repository root:

    python3 tools/serve-playtest.py            # 127.0.0.1:8000
    python3 tools/serve-playtest.py 8080       # a different port

Serves the current working directory and binds to loopback only. Do not expose
it to a network.
"""

import functools
import http.server
import os
import socketserver
import sys

DEFAULT_PORT = 8000
BIND = "127.0.0.1"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # no-store rather than no-cache: no-cache still permits a stored copy
        # revalidated by ETag/Last-Modified, and a stale revalidation is the
        # failure this file exists to prevent.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Quiet by default; a request log per asset buries anything useful.
        if os.environ.get("PLAYTEST_SERVER_VERBOSE"):
            super().log_message(fmt, *args)


def main(argv):
    port = DEFAULT_PORT
    if len(argv) > 1:
        try:
            port = int(argv[1])
        except ValueError:
            print(f"Not a port number: {argv[1]}", file=sys.stderr)
            return 2

    handler = functools.partial(NoCacheHandler, directory=os.getcwd())
    socketserver.TCPServer.allow_reuse_address = True

    try:
        with socketserver.TCPServer((BIND, port), handler) as httpd:
            print(f"Serving {os.getcwd()} at http://{BIND}:{port}/  (caching disabled)")
            print("Playtest harness: "
                  f"http://{BIND}:{port}/tools/gate-slice-playtest-v2.html")
            print("Ctrl-C to stop.")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    except OSError as error:
        print(f"Could not bind {BIND}:{port} - {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
