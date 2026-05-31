"""
recv_feishu_server.py
======================
本地接收 server，配合 scan_browser_script.js 使用。
浏览器扫描完飞书后，会通过 fetch POST 把数据传到本 server，落地为
/Users/jiayi/Downloads/feishu_full_scan.json，然后 sync_feishu_drive.py 处理。

启动：
  python3 tools/recv_feishu_server.py
端口：127.0.0.1:9991
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import os

OUT = os.path.expanduser('~/Downloads/feishu_full_scan.json')

class H(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        with open(OUT, 'wb') as f:
            f.write(body)
        print(f'✅ saved {length} bytes → {OUT}')
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'OK')
    
    def do_GET(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'OK - waiting for POST')
    
    def log_message(self, *a, **kw): pass

if __name__ == '__main__':
    print('Listening on http://127.0.0.1:9991/')
    print('Tip: now go Chrome → my.feishu.cn → DevTools Console → 粘贴 scan_browser_script.js')
    HTTPServer(('127.0.0.1', 9991), H).serve_forever()
