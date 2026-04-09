import http.server, os
os.chdir("/Users/raulysdyxyamferreirasantos/Downloads/viga-sales")
http.server.HTTPServer(("", 3000), http.server.SimpleHTTPRequestHandler).serve_forever()
