"""Serveur local du configurateur DIÈDRE 29, sans cache (les modifications s'affichent au rechargement).
Usage : python3 serve.py [port]   (défaut 8429)
"""
import http.server, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

os.chdir(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8429
http.server.ThreadingHTTPServer(('', port), NoCache).serve_forever()
