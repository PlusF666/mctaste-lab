from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1] / 'dist'
    print('McTaste Lab: http://127.0.0.1:8766', flush=True)
    server = ThreadingHTTPServer(('127.0.0.1',8766),partial(SimpleHTTPRequestHandler,directory=str(root)))
    try: server.serve_forever()
    except KeyboardInterrupt: server.server_close()
