"""Cross-platform local launcher. Run: python run.py"""
import os
import threading
import webbrowser
from app.server import build_server
from app.config import load_local_env

if __name__=='__main__':
    load_local_env()
    server=build_server(int(os.environ.get('PORT','8765')))
    url=f'http://127.0.0.1:{server.server_address[1]}'
    print(f'브라우저 미리보기: {url}\n종료: Ctrl+C',flush=True)
    threading.Timer(.5,lambda:webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
