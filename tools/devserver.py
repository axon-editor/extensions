"""Static server for local extension webview testing.

Switching games on one port strands the previous game's cached ES modules, and the
new page then dies on an import that does not exist in the new game. Response
headers alone do not fix it: a 304 says "your copy is current" and the browser keeps
it. Both halves are needed here, the response saying never reuse, and the request's
own conditional headers being ignored so a stale entry can never be revalidated into
the answer.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
    }

    # Last-Modified is dropped rather than ETag-compared: the stock handler answers a
    # conditional request with 304 straight out of send_head, before the response is
    # ever built, and a 304 is what keeps the previous game's module alive.
    def send_header(self, keyword, value):
        if keyword == "Last-Modified":
            return
        super().send_header(keyword, value)

    def send_response(self, code, message=None):
        super().send_response(code, message)
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")

    # The conditional request headers are dropped before the stock handler sees them.
    # Without this it still answers a revalidation with 304 from inside send_head, and
    # the browser reuses its stale copy no matter what send_response advertises.
    CONDITIONAL_HEADERS = ("If-Modified-Since", "If-None-Match", "If-Range", "If-Unmodified-Since")

    def do_GET(self):
        for header in self.CONDITIONAL_HEADERS:
            if header in self.headers:
                del self.headers[header]
        super().do_GET()

    def do_HEAD(self):
        self.do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))


def main():
    directory = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8123
    handler = partial(NoCacheHandler, directory=str(directory))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"serving {directory} at http://127.0.0.1:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
