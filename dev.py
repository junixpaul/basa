# Local dev server: like `python3 -m http.server`, but tells the browser never to cache,
# so code changes show up on a normal reload.
import http.server

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

http.server.test(HandlerClass=NoCache, port=5173)
