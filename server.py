import webbrowser
from sys import exit
from threading import Timer
from livereload import Server

PORT = 8000

try:
    server = Server()
    server.watch('*.html')
    server.watch('js/*.js')
    server.watch('statefiles/*.json')
    
    # Open browser after a short delay to ensure server is ready
    def open_browser():
        webbrowser.open_new_tab(f'http://localhost:{PORT}')
    
    Timer(1.0, open_browser).start()
    server.serve(root='.', port=PORT) 

except KeyboardInterrupt:
    exit()