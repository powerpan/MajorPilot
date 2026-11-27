"""Dev server for the redesign prototype.
Threaded, with a deep listen queue (python -m http.server uses a backlog of 5, which drops
requests when several headless Chrome screenshots load ~15 files at once) and no caching.
Usage: python3 tools/serve.py [port=8790]   (run from the redesign folder)"""
import http.server, os, sys

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, *a):
        pass

class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True
    allow_reuse_address = True

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
    Server(("", port), Handler).serve_forever()
