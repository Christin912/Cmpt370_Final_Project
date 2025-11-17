import webbrowser
from sys import exit
from livereload import Server

PORT = 8000

try:
    webbrowser.open_new_tab(f'http://localhost:{PORT}')
    server = Server()
    server.watch('*.html')
    server.watch('js/*.js')
    server.serve(root='.', port=PORT) 

except KeyboardInterrupt:
    exit()