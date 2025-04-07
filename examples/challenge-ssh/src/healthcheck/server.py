from http.server import BaseHTTPRequestHandler, HTTPServer


class ServerRequestHandler(BaseHTTPRequestHandler):

    def do_GET(self):
        message = "OK".encode()
        self.send_response(200)
        self.send_header("Content-type", "text/plain; charset=utf-8")
        self.send_header("Content-length", len(message))
        self.end_headers()
        self.wfile.write(message)
        return


httpd = HTTPServer(("0.0.0.0", 8080), ServerRequestHandler)
httpd.serve_forever()
